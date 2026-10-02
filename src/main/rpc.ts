import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { StringDecoder } from 'node:string_decoder'
import { t } from '@shared/i18n'
import { nodeExecPath, piCliPath, shellEnv } from './env'

interface Pending {
  resolve: (data: unknown) => void
  reject: (error: Error) => void
}

/**
 * 一个以 RPC 模式运行的 Pi 进程。协议是按行分隔的 JSON：
 * 往 stdin 写命令，从 stdout 读响应和事件。
 */
export class PiProcess extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams
  private pending = new Map<string, Pending>()
  private seq = 0
  private stderrTail = ''
  exited = false

  constructor(
    private cwd: string,
    private args: string[]
  ) {
    super()
  }

  async start(): Promise<void> {
    const env = { ...(await shellEnv()), ELECTRON_RUN_AS_NODE: '1' }
    const child = spawn(nodeExecPath(), [piCliPath(), '--mode', 'rpc', ...this.args], {
      cwd: this.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child

    // 协议要求只按 \n 切分，不能用 readline（它会把 U+2028 也当换行）
    const decoder = new StringDecoder('utf8')
    let buffer = ''
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += decoder.write(chunk)
      let i: number
      while ((i = buffer.indexOf('\n')) >= 0) {
        let line = buffer.slice(0, i)
        buffer = buffer.slice(i + 1)
        if (line.endsWith('\r')) line = line.slice(0, -1)
        if (line) this.handleLine(line)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString('utf8')).slice(-4000)
    })
    child.on('error', (error) => this.finish(error.message))
    child.on('exit', (code) => this.finish(code === 0 || code === null ? undefined : t('Pi 进程退出（代码 {code}）', { code })))
  }

  private handleLine(line: string): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (message.type === 'response' && typeof message.id === 'string' && this.pending.has(message.id)) {
      const waiter = this.pending.get(message.id)!
      this.pending.delete(message.id)
      if (message.success) waiter.resolve(message.data)
      else waiter.reject(new Error(String(message.error ?? t('命令失败'))))
      return
    }
    this.emit('event', message)
  }

  private finish(error?: string): void {
    if (this.exited) return
    this.exited = true
    const detail = error ? `${error}\n${this.stderrTail.trim()}`.trim() : undefined
    for (const waiter of this.pending.values()) waiter.reject(new Error(detail ?? t('Pi 进程已退出')))
    this.pending.clear()
    this.emit('exit', detail)
  }

  request<T = unknown>(command: Record<string, unknown>): Promise<T> {
    if (!this.child || this.exited) return Promise.reject(new Error(t('Pi 进程没有在运行')))
    const id = `r${++this.seq}`
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (data: unknown) => void, reject })
      this.child!.stdin.write(`${JSON.stringify({ id, ...command })}\n`)
    })
  }

  /** 不需要响应的消息，比如对扩展弹窗的回答 */
  send(message: Record<string, unknown>): void {
    if (this.child && !this.exited) this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  kill(): void {
    if (this.child && !this.exited) this.child.kill()
  }
}
