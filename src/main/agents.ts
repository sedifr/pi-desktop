import { t } from '@shared/i18n'
import type { ConvEvent, ConvInfo, ImageAttachment, ModelInfo } from '@shared/types'
import { copySession, launchArgs, rekey } from './caps'
import { PiProcess } from './rpc'

interface Conv {
  key: string
  cwd: string
  sessionFile?: string
  proc?: PiProcess
  starting?: Promise<ConvInfo>
  signature?: string
  streaming: boolean
  info: ConvInfo
  /** 用户选过的模型和推理级别，重启进程后要重新套上 */
  wantModel?: { provider: string; id: string }
  wantThinking?: string
  lastUsed: number
}

const IDLE_MS = 15 * 60_000
const MAX_LIVE = 6

const slimModel = (m: any): ModelInfo | undefined =>
  m ? { provider: m.provider, id: m.id, name: m.name, contextWindow: m.contextWindow, reasoning: m.reasoning, input: m.input } : undefined

/** 管理每个对话背后的 Pi 进程：按需启动，能力设置变了就重启，闲置的回收 */
export class AgentManager {
  private convs = new Map<string, Conv>()

  constructor(private emit: (key: string, event: ConvEvent) => void) {
    setInterval(() => this.reap(), 60_000).unref()
  }

  private conv(key: string, cwd?: string, sessionFile?: string): Conv {
    let conv = this.convs.get(key)
    if (!conv) {
      if (!cwd) throw new Error(t('对话还没有打开'))
      conv = { key, cwd, sessionFile, streaming: false, info: {}, lastUsed: Date.now() }
      this.convs.set(key, conv)
    }
    conv.lastUsed = Date.now()
    return conv
  }

  /** 这个对话存能力设置时用的名字：有会话文件就用文件路径，否则用临时 key */
  capsKey(key: string): string {
    return this.convs.get(key)?.sessionFile ?? key
  }

  async isDirty(key: string): Promise<boolean> {
    const conv = this.convs.get(key)
    if (!conv?.proc || conv.proc.exited) return false
    return (await launchArgs(this.capsKey(key), conv.cwd)).signature !== conv.signature
  }

  start(key: string, cwd: string, sessionFile?: string): Promise<ConvInfo> {
    const conv = this.conv(key, cwd, sessionFile)
    if (conv.proc && !conv.proc.exited) return Promise.resolve(conv.info)
    conv.starting ??= this.spawn(conv).finally(() => (conv.starting = undefined))
    return conv.starting
  }

  private async spawn(conv: Conv): Promise<ConvInfo> {
    this.emit(conv.key, { type: '_status', status: 'starting' })
    const launch = await launchArgs(this.capsKey(conv.key), conv.cwd)
    const proc = new PiProcess(conv.cwd, [...(conv.sessionFile ? ['--session', conv.sessionFile] : []), ...launch.args])
    conv.proc = proc
    conv.signature = launch.signature
    conv.streaming = false

    proc.on('event', (event: ConvEvent) => {
      if (event.type === 'agent_start') conv.streaming = true
      // agent_end 后如果要自动重试，Pi 会马上再发 agent_start；agent_settled 才是彻底停下
      if ((event.type === 'agent_end' && !event.willRetry) || event.type === 'agent_settled') {
        const wasStreaming = conv.streaming
        conv.streaming = false
        if (wasStreaming) void this.refresh(conv).catch(() => {})
      }
      this.emit(conv.key, event)
    })
    proc.on('exit', (error?: string) => {
      if (conv.proc !== proc) return
      conv.proc = undefined
      conv.streaming = false
      this.emit(conv.key, { type: '_status', status: 'exited', error })
    })

    try {
      await proc.start()
      await this.refresh(conv, true)
      if (conv.wantModel && (conv.info.model?.id !== conv.wantModel.id || conv.info.model?.provider !== conv.wantModel.provider)) {
        await proc.request({ type: 'set_model', provider: conv.wantModel.provider, modelId: conv.wantModel.id })
        await this.refresh(conv)
      }
      if (conv.wantThinking && conv.info.thinkingLevel !== conv.wantThinking) {
        await proc.request({ type: 'set_thinking_level', level: conv.wantThinking })
        await this.refresh(conv)
      }
    } catch (error) {
      proc.kill()
      throw error
    }
    this.emit(conv.key, { type: '_status', status: 'ready' })
    return conv.info
  }

  /** 从进程读一遍当前状态并通知界面 */
  private async refresh(conv: Conv, full = false): Promise<void> {
    const proc = conv.proc
    if (!proc || proc.exited) return
    const state = await proc.request<any>({ type: 'get_state' })
    conv.info = {
      ...conv.info,
      model: slimModel(state.model),
      thinkingLevel: state.thinkingLevel,
      sessionFile: state.sessionFile,
      sessionId: state.sessionId,
      sessionName: state.sessionName
    }
    if (state.sessionFile && state.sessionFile !== conv.sessionFile) {
      rekey(this.capsKey(conv.key), state.sessionFile)
      conv.sessionFile = state.sessionFile
    }
    if (full) {
      const [models, commands] = await Promise.all([
        proc.request<{ models: any[] }>({ type: 'get_available_models' }),
        proc.request<{ commands: any[] }>({ type: 'get_commands' })
      ])
      conv.info.models = models.models.map((m) => slimModel(m)!)
      conv.info.commands = commands.commands.map((c) => ({ name: c.name, description: c.description, source: c.source, argumentHint: c.argumentHint }))
    }
    const levels = await proc.request<{ levels?: string[] }>({ type: 'get_available_thinking_levels' }).catch(() => undefined)
    conv.info.thinkingLevels = levels?.levels
    this.emit(conv.key, { type: '_info', info: conv.info })
    const stats = await proc.request({ type: 'get_session_stats' }).catch(() => undefined)
    if (stats) this.emit(conv.key, { type: '_stats', stats })
  }

  private async stop(conv: Conv): Promise<void> {
    const proc = conv.proc
    if (!proc || proc.exited) return
    await new Promise<void>((resolve) => {
      proc.once('exit', () => resolve())
      proc.kill()
    })
    conv.proc = undefined
  }

  /**
   * 发一条消息。返回 Pi 怎么处理了它：started 开始回答，queued 排进了队列，
   * handled 被扩展命令直接处理掉了（这时不会有用户消息回显）。
   */
  async prompt(key: string, text: string, images: ImageAttachment[] = [], behavior: 'steer' | 'followUp' = 'steer'): Promise<string> {
    const conv = this.conv(key)
    if (conv.proc && !conv.proc.exited && !conv.streaming && (await this.isDirty(key))) await this.stop(conv)
    await this.start(key, conv.cwd, conv.sessionFile)
    const command: Record<string, unknown> = { type: 'prompt', message: text }
    if (images.length) command.images = images.map((image) => ({ type: 'image', data: image.data, mimeType: image.mimeType }))
    // 正在回答时再发消息：steer 是当前这一步之后插入，followUp 是等全部做完再说
    if (conv.streaming) command.streamingBehavior = behavior
    const result = await conv.proc!.request<{ disposition?: string } | undefined>(command)
    return result?.disposition ?? 'started'
  }

  async setName(key: string, name: string): Promise<ConvInfo> {
    const conv = this.conv(key)
    await this.start(key, conv.cwd, conv.sessionFile)
    await conv.proc!.request({ type: 'set_session_name', name })
    await this.refresh(conv)
    return conv.info
  }

  /** 导出成一个网页文件，返回它的路径 */
  async exportHtml(key: string): Promise<string> {
    const conv = this.conv(key)
    await this.start(key, conv.cwd, conv.sessionFile)
    const result = await conv.proc!.request<{ path: string }>({ type: 'export_html' })
    return result.path
  }

  /**
   * 从某条用户消息另开一个对话：新对话保留那条消息之前的内容，那条消息的文字交还给输入框重新编辑。
   * Pi 的做法是让当前进程直接切到新会话上，所以这里把这条对话记录改挂到新会话文件名下，
   * 原来的会话下次打开时会另起一个进程。
   */
  async fork(key: string, userIndex: number, text: string): Promise<{ key: string; text: string } | undefined> {
    const conv = this.conv(key)
    if (conv.streaming) throw new Error(t('正在回答时不能另开对话，先停下来'))
    await this.start(key, conv.cwd, conv.sessionFile)
    const proc = conv.proc!
    const list = await proc.request<{ messages: { entryId: string; text: string }[] }>({ type: 'get_fork_messages' })
    const trimmed = text.trim()
    // 优先按位置找，位置对不上（比如前面的内容被压缩过）就按文字找最后一条相同的
    const byIndex = list.messages[userIndex]
    const target = byIndex?.text.trim() === trimmed ? byIndex : [...list.messages].reverse().find((message) => message.text.trim() === trimmed)
    if (!target) throw new Error(t('找不到这条消息，没法从这里另开'))
    const result = await proc.request<{ text?: string; cancelled?: boolean }>({ type: 'fork', entryId: target.entryId })
    if (result.cancelled) return undefined

    const state = await proc.request<{ sessionFile?: string }>({ type: 'get_state' })
    const previous = this.capsKey(key)
    const nextKey = state.sessionFile ?? `new:${Date.now()}`
    copySession(previous, nextKey)
    this.convs.delete(key)
    conv.key = nextKey
    conv.sessionFile = state.sessionFile
    this.convs.set(nextKey, conv)
    return { key: nextKey, text: result.text ?? text }
  }

  /** 界面在分叉后调用：新对话的记录建好了，把当前状态发过去 */
  async sync(key: string): Promise<void> {
    const conv = this.convs.get(key)
    if (conv) await this.refresh(conv, true)
  }

  async abort(key: string): Promise<void> {
    await this.convs.get(key)?.proc?.request({ type: 'abort' })
  }

  async setModel(key: string, provider: string, id: string): Promise<ConvInfo> {
    const conv = this.conv(key)
    conv.wantModel = { provider, id }
    await this.start(key, conv.cwd, conv.sessionFile)
    await conv.proc!.request({ type: 'set_model', provider, modelId: id })
    await this.refresh(conv)
    return conv.info
  }

  async setThinking(key: string, level: string): Promise<ConvInfo> {
    const conv = this.conv(key)
    conv.wantThinking = level
    await this.start(key, conv.cwd, conv.sessionFile)
    await conv.proc!.request({ type: 'set_thinking_level', level })
    await this.refresh(conv)
    return conv.info
  }

  async compact(key: string, instructions?: string): Promise<void> {
    const conv = this.conv(key)
    await this.start(key, conv.cwd, conv.sessionFile)
    await conv.proc!.request(instructions ? { type: 'compact', customInstructions: instructions } : { type: 'compact' })
    await this.refresh(conv)
  }

  uiResponse(key: string, payload: Record<string, unknown>): void {
    this.convs.get(key)?.proc?.send({ type: 'extension_ui_response', ...payload })
  }

  close(key: string): void {
    const conv = this.convs.get(key)
    if (!conv || conv.streaming) return
    conv.proc?.kill()
    this.convs.delete(key)
  }

  /** 关掉所有没在回答的进程；它们下次被用到时会带着最新的账号和模型重新启动 */
  restartIdle(): void {
    for (const conv of this.convs.values()) {
      const proc = conv.proc
      if (!proc || proc.exited || conv.streaming) continue
      // 立刻当它已经退出。不然在它真正退出前的这一小段时间里，界面来要状态会拿到旧的
      conv.proc = undefined
      proc.kill()
      this.emit(conv.key, { type: '_status', status: 'exited' })
    }
  }

  closeAll(): void {
    for (const conv of this.convs.values()) conv.proc?.kill()
  }

  private reap(): void {
    const live = [...this.convs.values()].filter((conv) => conv.proc && !conv.proc.exited && !conv.streaming)
    live.sort((a, b) => a.lastUsed - b.lastUsed)
    const now = Date.now()
    live.forEach((conv, index) => {
      if (now - conv.lastUsed > IDLE_MS || live.length - index > MAX_LIVE) conv.proc?.kill()
    })
  }
}
