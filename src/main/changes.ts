import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'
import { t } from '@shared/i18n'
import type { ChangedFile, ChangesInfo } from '@shared/types'

const MAX_DIFF = 400_000

function git(cwd: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('git', ['-c', 'core.quotepath=false', ...args], { cwd, maxBuffer: 16 * 1024 * 1024, timeout: 10_000 }, (error, stdout) => resolve(error ? undefined : stdout))
  })
}

/** 界面传来的文件只能是这个项目文件夹里面的 */
function inside(cwd: string, file: string): string {
  const full = path.resolve(cwd, file)
  if (full !== cwd && !full.startsWith(cwd + path.sep)) throw new Error(t('这个文件不在项目文件夹里'))
  return full
}

const STATUS: Record<string, ChangedFile['status']> = { M: 'modified', A: 'added', D: 'deleted', R: 'renamed', C: 'added', T: 'modified', U: 'modified' }

/**
 * 项目里还没提交的改动。不是 git 仓库时返回 git: false，
 * 界面那边会改成只列出这次对话里 Pi 动过的文件。
 */
export async function listChanges(cwd: string): Promise<ChangesInfo> {
  if ((await git(cwd, ['rev-parse', '--is-inside-work-tree']))?.trim() !== 'true') return { git: false, files: [] }
  const branch = (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim()
  const status = (await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])) ?? ''
  const files = new Map<string, ChangedFile>()
  const parts = status.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (entry.length < 4) continue
    const code = entry.slice(0, 2)
    const file = entry.slice(3)
    // 改名的条目后面还跟着一段旧名字
    if (code.includes('R') || code.includes('C')) i++
    const kind = code === '??' ? 'untracked' : (STATUS[code[0] === ' ' ? code[1] : code[0]] ?? 'modified')
    files.set(file, { path: file, status: kind })
  }
  // 每个文件加了几行、删了几行。仓库还没有任何提交时没有 HEAD，就只看暂存区
  const stat = (await git(cwd, ['diff', 'HEAD', '--numstat'])) ?? (await git(cwd, ['diff', '--cached', '--numstat'])) ?? ''
  for (const line of stat.split('\n')) {
    const [added, removed, name] = line.split('\t')
    const item = name ? files.get(name) : undefined
    if (item && added !== '-') Object.assign(item, { added: Number(added), removed: Number(removed) })
  }
  return { git: true, branch: branch && branch !== 'HEAD' ? branch : undefined, files: [...files.values()].slice(0, 500) }
}

/** 一个文件的改动，统一差异格式的文字。没被 git 记录过的新文件，整个当成新增 */
export async function fileDiff(cwd: string, file: string): Promise<string> {
  const full = inside(cwd, file)
  const tracked = await git(cwd, ['diff', 'HEAD', '--', file])
  let diff = tracked ?? (await git(cwd, ['diff', '--cached', '--', file])) ?? ''
  if (!diff.trim()) {
    let text: string
    try {
      const buffer = fs.readFileSync(full)
      if (buffer.length > MAX_DIFF) return t('文件太大，不在这里显示')
      if (buffer.includes(0)) return t('这不是文本文件，没法显示改动')
      text = buffer.toString('utf8')
    } catch {
      return ''
    }
    const lines = text.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    diff = `--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join('\n')}\n`
  }
  return diff.length > MAX_DIFF ? `${diff.slice(0, MAX_DIFF)}\n${t('…（改动太长，后面的没有显示）')}` : diff
}

export function openFile(cwd: string, file: string): void {
  void shell.openPath(inside(cwd, file))
}

export function revealFile(cwd: string, file: string): void {
  shell.showItemInFolder(inside(cwd, file))
}
