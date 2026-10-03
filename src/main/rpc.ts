import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { StringDecoder } from 'node:string_decoder'
import { t } from '@shared/i18n'
import { getConfig } from './config'
import { cleanEnvPath, nodeExecPath, piCliPath, shellEnv } from './env'

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
  /** 是我们自己让它结束的。这种退出不算出错 */
  private killed = false
  exited = false

  constructor(
    private cwd: string,
    private args: string[]
  ) {
    super()
  }

  async start(): Promise<void> {
    const env: NodeJS.ProcessEnv = { ...(await shellEnv()), ELECTRON_RUN_AS_NODE: '1' }
    // 用户定了统一的存图文件夹时告诉 Pi 里的出图工具；认这个变量的工具会把图存到那里
    const imageDir = getConfig().imageDir
    if (imageDir) env.PI_DESKTOP_IMAGE_DIR = imageDir
    else delete env.PI_DESKTOP_IMAGE_DIR
    // 取环境变量要一会儿；这期间如果已经被要求结束，就不用起了
    if (this.killed) return this.finish()
    // 调试时把启动参数打出来：Pi 启动后会把自己的进程名改成 pi，从进程列表里看不到参数
    if (process.env.PI_DESKTOP_DEBUG === '1') console.log('[pi-desktop] pi args:', this.args.join(' '))
    const child = spawn(nodeExecPath(), ['-r', cleanEnvPath(), piCliPath(), '--mode', 'rpc', ...this.args], {
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
    // 进程先一步退出时，还没写完的输入会报错；这里接住，退出本身由 exit 事件处理
    child.stdin.on('error', () => {})
    child.stderr.on('data', (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString('utf8')).slice(-4000)
    })
    child.on('error', (error) => this.finish(error.message))
    // Pi 收到结束信号后会带着非零的代码退出，那是正常收尾
    child.on('exit', (code) => this.finish(code === 0 || code === null || this.killed ? undefined : t('Pi 进程退出（代码 {code}）', { code })))
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
    if (this.exited) return
    this.killed = true
    const child = this.child
    // 还没真正起起来：记下来就算结束了，start() 那边看到后不会再起
    if (!child) return this.finish()
    child.kill()
    // 好好说不听就强制结束，免得等它退出的地方一直挂着
    setTimeout(() => {
      if (!this.exited) child.kill('SIGKILL')
    }, 4000).unref()
  }
}
