import { t } from '@shared/i18n'
import fs from 'node:fs'
import type { BashResult, ConvEvent, ConvInfo, ImageAttachment, ModelInfo } from '@shared/types'
import { copySession, launchArgs, rekey } from './caps'
import { rewindSession } from './sessions'
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
  /** 彻底停下过几次。用来判断「发出去的这条」是不是已经跑完了 */
  settled: number
  /** 正在做不能被打断的事（跑用户敲的命令、压缩）的数量。大于 0 就不算空闲 */
  working: number
  /** 跑过用户敲的命令，但会话还没落盘。这时重启进程，命令的输出就从上下文里丢了 */
  unsavedShell?: boolean
  /** 该重启了，但当时正忙；等它停下来再重启 */
  restartWhenIdle?: boolean
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
      // 界面重新加载之后，同一个会话会换一个名字来找。认出它来接着用，
      // 不然会对同一个会话文件再起一个 Pi，两个进程同时往里写
      const same = sessionFile ? [...this.convs.values()].find((other) => other.sessionFile === sessionFile) : undefined
      if (same) {
        this.convs.delete(same.key)
        same.key = key
        this.convs.set(key, same)
        same.lastUsed = Date.now()
        if (same.streaming) setImmediate(() => this.emit(key, { type: 'agent_start' }))
        return same
      }
      conv = { key, cwd, sessionFile, streaming: false, working: 0, settled: 0, info: {}, lastUsed: Date.now() }
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
    // 正在启动的要等它启动完（模型、推理级别都套好了）才算可用
    if (conv.starting) return conv.starting
    if (conv.proc && !conv.proc.exited) {
      // 界面可能是重新加载过的，不知道这个进程还活着；把状态再告诉它一遍
      this.emit(key, { type: '_status', status: 'ready' })
      this.emit(key, { type: '_info', info: conv.info })
      return Promise.resolve(conv.info)
    }
    conv.starting = this.spawn(conv).finally(() => {
      conv.starting = undefined
      if (conv.restartWhenIdle && !this.busy(conv)) this.retire(conv)
    })
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
      this.emit(conv.key, event)
      // agent_end 只是一小段跑完了，后面可能还有自动重试、压缩、排队的消息；
      // agent_settled 才是 Pi 彻底停下、可以接新消息的时候
      if (event.type === 'agent_settled') {
        conv.streaming = false
        conv.settled++
        // 干了很久的活也算刚用过，别一停下就被当成闲置回收
        conv.lastUsed = Date.now()
        conv.unsavedShell = false
        if (conv.restartWhenIdle && !this.busy(conv)) this.retire(conv)
        else void this.refresh(conv).catch(() => {})
      }
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
        try {
          await proc.request({ type: 'set_model', provider: conv.wantModel.provider, modelId: conv.wantModel.id })
          await this.refresh(conv)
        } catch {
          // 之前选的模型现在用不了了（比如那个账号退出了）。不拦着对话启动，按 Pi 自己的默认模型来
          conv.wantModel = undefined
        }
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
      sessionName: state.sessionName,
      autoCompaction: state.autoCompactionEnabled
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
    // 设置变了要重启才生效。但会话还没落盘、里面只有用户敲的命令输出时先不重启：
    // 重启会把那些输出从上下文里丢掉。这条消息发出去之后会话就落盘了，下一条再重启
    if (conv.proc && !conv.proc.exited && !this.busy(conv) && !conv.unsavedShell && (await this.isDirty(key))) await this.stop(conv)
    await this.start(key, conv.cwd, conv.sessionFile)
    const proc = conv.proc
    if (!proc || proc.exited) throw new Error(t('Pi 进程没有在运行'))
    // 正在回答时再发消息：steer 是当前这一步之后插入，followUp 是等全部做完再说。
    // 每次都带上：Pi 没在回答时会忽略它；而「刚发出一条、Pi 还没报开始」的那一小段里，
    // 这边还不知道它在忙，不带的话第二条会被拒绝或丢掉
    const command: Record<string, unknown> = { type: 'prompt', message: text, streamingBehavior: behavior }
    if (images.length) command.images = images.map((image) => ({ type: 'image', data: image.data, mimeType: image.mimeType }))
    const settledBefore = conv.settled
    const result = await proc.request<{ disposition?: string } | undefined>(command)
    const disposition = result?.disposition ?? 'started'
    // Pi 接下了，这一轮就算开始了，不等它的开始事件。但如果这一轮已经跑完（比如立刻就报错了），就不要再标成在忙
    if (disposition === 'started' && !proc.exited && conv.settled === settledBefore) conv.streaming = true
    return disposition
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

  /**
   * 回到第 userIndex 条用户消息之前，准备从那里重新来（修改消息、重新生成）。
   * 进程要先停掉：它在内存里记着原来的位置，下次启动才会按文件里新的位置接着走。
   */
  async rewind(key: string, userIndex: number, text: string): Promise<void> {
    const conv = this.conv(key)
    if (this.busy(conv)) throw new Error(t('正在回答时不能改，先停下来'))
    if (!conv.sessionFile || !fs.existsSync(conv.sessionFile)) throw new Error(t('这个对话还没有存下来，没法从中间重新来'))
    await this.stop(conv)
    rewindSession(conv.sessionFile, userIndex, text)
  }

  /** 界面在分叉后调用：新对话的记录建好了，把当前状态发过去 */
  async sync(key: string): Promise<void> {
    const conv = this.convs.get(key)
    if (conv) await this.refresh(conv, true)
  }

  /** 撤回排着队还没处理的消息，返回它们的原文 */
  async clearQueue(key: string): Promise<string[]> {
    const proc = this.convs.get(key)?.proc
    if (!proc || proc.exited) return []
    const queued = await proc.request<{ steering?: string[]; followUp?: string[] }>({ type: 'clear_queue' })
    return [...(queued.steering ?? []), ...(queued.followUp ?? [])]
  }

  /**
   * 停止回答。先把排队的消息撤回来：不然 Pi 停下后会接着处理它们，等于没停。
   * 撤回的原文交还给界面，放回输入框。
   */
  async abort(key: string): Promise<string[]> {
    const proc = this.convs.get(key)?.proc
    if (!proc || proc.exited) return []
    const queued = await this.clearQueue(key).catch(() => [])
    // 停止这一步就算失败，撤回来的消息也要还给界面
    await proc.request({ type: 'abort' }).catch(() => {})
    return queued
  }

  /** 直接运行用户敲的命令。输出边跑边以 bash_execution_update 事件送到界面 */
  async bash(key: string, command: string, exclude: boolean): Promise<BashResult> {
    const conv = this.conv(key)
    await this.start(key, conv.cwd, conv.sessionFile)
    return this.whileWorking(conv, async () => {
      const result = await conv.proc!.request<BashResult>({ type: 'bash', command, excludeFromContext: exclude })
      await this.refresh(conv).catch(() => {})
      // Pi 要到第一条消息才把会话写进文件
      if (!conv.sessionFile || !fs.existsSync(conv.sessionFile)) conv.unsavedShell = true
      return result
    })
  }

  async abortBash(key: string): Promise<void> {
    await this.convs.get(key)?.proc?.request({ type: 'abort_bash' })
  }

  async setAutoCompaction(key: string, enabled: boolean): Promise<ConvInfo> {
    const conv = this.conv(key)
    await this.start(key, conv.cwd, conv.sessionFile)
    await conv.proc!.request({ type: 'set_auto_compaction', enabled })
    // 这是全局设置，但别的 Pi 进程启动时已经读过旧值了，一起改过来
    for (const other of this.convs.values()) {
      if (other !== conv && other.proc && !other.proc.exited) void other.proc.request({ type: 'set_auto_compaction', enabled }).catch(() => {})
    }
    await this.refresh(conv)
    return conv.info
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
    await this.whileWorking(conv, () => conv.proc!.request(instructions ? { type: 'compact', customInstructions: instructions } : { type: 'compact' }))
    await this.refresh(conv)
  }

  uiResponse(key: string, payload: Record<string, unknown>): void {
    this.convs.get(key)?.proc?.send({ type: 'extension_ui_response', ...payload })
  }

  /**
   * 会话文件要被挪走了：放下所有用着它的进程，等它们真正退出再返回。
   * 不等的话，进程收尾时可能还往老位置写一笔。正忙的不让挪。
   */
  async release(sessionFile: string): Promise<void> {
    const using = [...this.convs.values()].filter((conv) => conv.sessionFile === sessionFile || conv.key === sessionFile)
    if (using.some((conv) => this.busy(conv))) throw new Error(t('这个对话正在运行，等它停下来再移'))
    for (const conv of using) {
      this.convs.delete(conv.key)
      await this.stop(conv)
    }
  }

  close(key: string): void {
    const conv = this.convs.get(key)
    if (!conv || this.busy(conv)) return
    conv.proc?.kill()
    this.convs.delete(key)
  }

  /**
   * 让一个闲着的进程下台。立刻当它已经退出：不然在它真正退出前的这一小段时间里，
   * 界面来要状态会拿到旧的。它下次被用到时会重新启动。
   */
  private retire(conv: Conv): void {
    const proc = conv.proc
    conv.restartWhenIdle = false
    if (!proc || proc.exited) return
    // 这时重启会把用户敲的命令输出从上下文里丢掉，留到它发出第一条消息之后
    if (conv.unsavedShell) {
      conv.restartWhenIdle = true
      return
    }
    conv.proc = undefined
    proc.kill()
    this.emit(conv.key, { type: '_status', status: 'exited' })
  }

  private busy(conv: Conv): boolean {
    return conv.streaming || conv.working > 0 || Boolean(conv.starting)
  }

  /** 做一件不能被打断的事。期间这个进程不会被回收或重启，做完再补上该做的重启 */
  private async whileWorking<T>(conv: Conv, work: () => Promise<T>): Promise<T> {
    conv.working++
    try {
      return await work()
    } finally {
      conv.working--
      conv.lastUsed = Date.now()
      if (conv.restartWhenIdle && !this.busy(conv)) this.retire(conv)
    }
  }

  /** 关掉所有没在忙的进程；正忙的记下来，等它停了再关 */
  restartIdle(): void {
    for (const conv of this.convs.values()) {
      if (!conv.proc || conv.proc.exited) continue
      if (this.busy(conv)) conv.restartWhenIdle = true
      else this.retire(conv)
    }
  }

  /** 有几个对话正在回答或者在跑命令。退出前用它来提醒 */
  busyCount(): number {
    return [...this.convs.values()].filter((conv) => conv.proc && !conv.proc.exited && (conv.streaming || conv.working > 0)).length
  }

  closeAll(): void {
    for (const conv of this.convs.values()) conv.proc?.kill()
  }

  private reap(): void {
    const live = [...this.convs.values()].filter((conv) => conv.proc && !conv.proc.exited && !this.busy(conv))
    live.sort((a, b) => a.lastUsed - b.lastUsed)
    const now = Date.now()
    live.forEach((conv, index) => {
      if (now - conv.lastUsed > IDLE_MS || live.length - index > MAX_LIVE) this.retire(conv)
    })
  }
}
