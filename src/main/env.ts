import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import { t } from '@shared/i18n'

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

/** 启动 Pi 前先跑的一小段脚本，见文件里的说明 */
export function cleanEnvPath(): string {
  return path.join(app.getAppPath(), 'resources', 'clean-env.cjs')
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
/** 用户的登录 shell。以系统里这个账号的设置为准；环境变量里的 SHELL 可能是启动应用的那个程序带来的 */
export function loginShell(): string {
  try {
    const shell = os.userInfo().shell
    if (shell && fs.existsSync(shell)) return shell
  } catch {
    // 拿不到就看环境变量
  }
  return process.env.SHELL || '/bin/zsh'
}

export function shellEnv(): Promise<NodeJS.ProcessEnv> {
  cached ??= new Promise((resolve) => {
    const shell = loginShell()
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

/**
 * 读一个准备改了再写回去的文件。文件不存在或是空的，返回空对象；存在但读不懂就抛错。
 * 绝不能把「读不懂」当成「是空的」：那样下一步写回去，用户文件里原有的内容就全没了。
 */
export function readJsonForEdit<T extends object>(file: string): T {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {} as T
    throw error
  }
  if (!text.trim()) return {} as T
  try {
    const data: unknown = JSON.parse(text)
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) return data as T
  } catch {
    // 下面统一报错
  }
  throw new Error(t('{file} 不是合法的 JSON（可能有注释、多余的逗号，或者手改时留下了错误）。为了不弄丢里面的内容，这次没有改动它。先把它改对再试。', { file }))
}

/**
 * 读桌面端自己的数据文件。读不懂时把坏掉的那份另存一份再从头开始，
 * 不让一次手滑把之前的设置无声无息地盖掉。
 */
export function readOwnJson<T>(file: string, fallback: T): T {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return fallback
  }
  try {
    return JSON.parse(text) as T
  } catch {
    try {
      if (text.trim()) fs.copyFileSync(file, `${file}.broken`)
    } catch {
      // 存不下来也不拦着应用启动
    }
    return fallback
  }
}

/** 写回一个 JSON 文件：先写到旁边再换过去。原来是符号链接就写到它指向的地方，原来的权限保持不变 */
export function writeJson(file: string, data: unknown, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  let target = file
  let keep = mode
  try {
    target = fs.realpathSync(file)
    keep = fs.statSync(target).mode & 0o777
  } catch {
    // 文件还不存在
  }
  const tmp = `${target}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), keep === undefined ? undefined : { mode: keep })
  if (keep !== undefined) fs.chmodSync(tmp, keep)
  fs.renameSync(tmp, target)
}
