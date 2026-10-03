import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { IPty } from 'node-pty'
import { HOME, loginShell, shellEnv } from './env'

const terminals = new Map<string, IPty>()
const require_ = createRequire(__filename)
let fixed = false

/**
 * node-pty 自带的那个小辅助程序，装下来时没有「可执行」权限，不改的话终端起不来。
 * 第一次用之前补上。
 */
function ensureHelper(): void {
  if (fixed) return
  fixed = true
  try {
    const dir = path.dirname(require_.resolve('node-pty/package.json')).replace('app.asar', 'app.asar.unpacked')
    const helper = path.join(dir, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
    if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755)
  } catch {
    // 找不到就算了，真起不来时下面会报错
  }
}

/**
 * 在项目文件夹里开一个真正的终端（用户自己的登录 shell）。
 * 同一个 id 已经开着就不重复开，这样界面重新连上时接的还是原来那个。
 */
export async function createTerminal(id: string, cwd: string, cols: number, rows: number, onData: (data: string) => void, onExit: (code: number) => void): Promise<void> {
  if (terminals.has(id)) return
  ensureHelper()
  const pty = require_('node-pty') as typeof import('node-pty')
  const env = { ...(await shellEnv()) } as Record<string, string>
  // 这个变量只是桌面端启动自己的子进程用的，留在终端里会让 Electron 应用起不来
  delete env.ELECTRON_RUN_AS_NODE
  env.TERM_PROGRAM = 'PiDesktop'
  const shell = loginShell()
  const term = pty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cols: Math.max(cols, 20),
    rows: Math.max(rows, 5),
    cwd: fs.existsSync(cwd) ? cwd : HOME,
    env
  })
  terminals.set(id, term)
  term.onData(onData)
  term.onExit(({ exitCode }) => {
    if (terminals.get(id) === term) terminals.delete(id)
    onExit(exitCode)
  })
}

export function writeTerminal(id: string, data: string): void {
  terminals.get(id)?.write(data)
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  try {
    terminals.get(id)?.resize(Math.max(cols, 20), Math.max(rows, 5))
  } catch {
    // 进程刚好退出了
  }
}

export function killTerminal(id: string): void {
  const term = terminals.get(id)
  terminals.delete(id)
  try {
    term?.kill()
  } catch {
    // 已经退出了
  }
}

export function killAllTerminals(): void {
  for (const id of [...terminals.keys()]) killTerminal(id)
}
