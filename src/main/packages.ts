import { spawn } from 'node:child_process'
import path from 'node:path'
import { t } from '@shared/i18n'
import type { PackageInfo } from '@shared/types'
import { AGENT_DIR, HOME, cleanEnvPath, nodeExecPath, piCliPath, readJson, shellEnv } from './env'

/** 已经装上的 Pi 包（技能、扩展、指令打成的一包），来自 Pi 的 settings.json */
export function listPackages(): PackageInfo[] {
  const settings = readJson<{ packages?: (string | { source?: string })[] }>(path.join(AGENT_DIR, 'settings.json'), {})
  return (settings.packages ?? [])
    .map((entry): PackageInfo => {
      const raw = typeof entry === 'string' ? entry : String(entry.source ?? '')
      const kind = raw.startsWith('npm:') ? 'npm' : /^(git:|https?:|ssh:)/.test(raw) ? 'git' : 'local'
      return {
        // 本机文件夹在设置里记的是相对于配置目录的路径；换成完整路径，看得明白，移除时 Pi 也认得
        source: kind === 'local' && raw ? path.resolve(AGENT_DIR, raw.replace(/^~(?=\/)/, HOME)) : raw,
        kind,
        // 写成对象的包只加载其中挑出来的一部分
        filtered: typeof entry !== 'string'
      }
    })
    .filter((item) => item.source)
}

let busy = false

/** 跑一条 pi 的包管理命令，输出一行行送回去 */
async function run(args: string[], onLine: (line: string) => void): Promise<void> {
  if (busy) throw new Error(t('上一个安装或移除还没结束'))
  busy = true
  try {
    const env = { ...(await shellEnv()), ELECTRON_RUN_AS_NODE: '1' }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(nodeExecPath(), ['-r', cleanEnvPath(), piCliPath(), ...args], { cwd: HOME, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let tail = ''
      const feed = (chunk: Buffer) => {
        const text = chunk.toString('utf8').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
        tail = (tail + text).slice(-2000)
        for (const line of text.split(/\r?\n/)) if (line.trim()) onLine(line.trimEnd())
      }
      child.stdout.on('data', feed)
      child.stderr.on('data', feed)
      child.on('error', reject)
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(tail.trim() || t('Pi 进程退出（代码 {code}）', { code: code ?? '?' })))))
    })
  } finally {
    busy = false
  }
}

function checkSource(source: string): string {
  const clean = source.trim()
  // 来源会作为一个参数交给 pi；以 - 开头会被当成选项
  if (!clean || clean.startsWith('-') || /[\r\n]/.test(clean)) throw new Error(t('这不像一个包的来源。可以是 npm:包名、git 仓库地址，或者本机文件夹'))
  return clean
}

export function installPackage(source: string, onLine: (line: string) => void): Promise<void> {
  return run(['install', checkSource(source)], onLine)
}

export function removePackage(source: string, onLine: (line: string) => void): Promise<void> {
  return run(['remove', checkSource(source)], onLine)
}
