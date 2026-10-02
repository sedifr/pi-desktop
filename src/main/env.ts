import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'

export const HOME = os.homedir()
export const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || path.join(HOME, '.pi', 'agent')
/** 桌面端自己的数据（能力开关、技能简介），放在 Pi 配置目录下方便用户找到 */
export const DESKTOP_DIR = path.join(AGENT_DIR, 'desktop')

export function piPackageDir(): string {
  return path.join(app.getAppPath(), 'node_modules', '@earendil-works', 'pi-coding-agent')
}

export function piCliPath(): string {
  return path.join(piPackageDir(), 'dist', 'cli.js')
}

export function piVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(piPackageDir(), 'package.json'), 'utf8')).version
  } catch {
    return '?'
  }
}

/** 用来跑 Pi 的 Node：Electron 自己的可执行文件，以 Node 模式运行 */
export function nodeExecPath(): string {
  const helper = (process as NodeJS.Process & { helperExecPath?: string }).helperExecPath
  return helper && fs.existsSync(helper) ? helper : process.execPath
}

let cached: Promise<NodeJS.ProcessEnv> | undefined

/**
 * 从 Dock 启动的应用拿不到终端里的 PATH，Pi 的 bash 工具和 MCP 服务会找不到命令。
 * 这里跑一次登录 shell 把环境变量取回来。
 */
export function shellEnv(): Promise<NodeJS.ProcessEnv> {
  cached ??= new Promise((resolve) => {
    const shell = process.env.SHELL || '/bin/zsh'
    const mark = '__PI_DESKTOP_ENV__'
    execFile(
      shell,
      ['-ilc', `printf '${mark}'; /usr/bin/env -0; printf '${mark}'`],
      { timeout: 8000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, DISABLE_AUTO_UPDATE: 'true' } },
      (error, stdout) => {
        const env: NodeJS.ProcessEnv = { ...process.env }
        const body = stdout?.split(mark)[1]
        if (!error && body) {
          for (const pair of body.split('\0')) {
            const i = pair.indexOf('=')
            if (i > 0) env[pair.slice(0, i)] = pair.slice(i + 1)
          }
        }
        resolve(env)
      }
    )
  })
  return cached
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}
