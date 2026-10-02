import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const MAX_FILES = 20_000
const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'out', 'build', '.next', '.cache'])
const cache = new Map<string, { at: number; files: string[] }>()

function gitFiles(cwd: string): Promise<string[] | undefined> {
  return new Promise((resolve) => {
    // -z：文件名之间用 \0 分隔并原样输出。不加的话，中文这类文件名会被 git 转义成一串八进制数字
    execFile('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd, maxBuffer: 32 * 1024 * 1024, timeout: 8000 }, (error, stdout) => {
      if (error) return resolve(undefined)
      resolve(stdout.split('\0').filter(Boolean).slice(0, MAX_FILES))
    })
  })
}

/** 不是 git 仓库时自己走一遍目录。跳过依赖和构建产物，数量有上限 */
function walkFiles(cwd: string): string[] {
  const out: string[] = []
  const queue = ['']
  while (queue.length && out.length < MAX_FILES) {
    const rel = queue.shift()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(path.join(cwd, rel), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.pi') continue
      const child = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) queue.push(child)
      } else if (out.length < MAX_FILES) out.push(child)
    }
  }
  return out
}

async function projectFiles(cwd: string): Promise<string[]> {
  const hit = cache.get(cwd)
  if (hit && Date.now() - hit.at < 30_000) return hit.files
  const files = (await gitFiles(cwd)) ?? walkFiles(cwd)
  cache.set(cwd, { at: Date.now(), files })
  return files
}

/** 给输入框里的 @ 用：按文件名和路径找项目里的文件，最像的排前面 */
export async function searchFiles(cwd: string, query: string): Promise<string[]> {
  const files = await projectFiles(cwd)
  const q = query.toLowerCase()
  if (!q) return files.slice(0, 30)
  const scored: { file: string; score: number }[] = []
  for (const file of files) {
    const lower = file.toLowerCase()
    const base = lower.slice(lower.lastIndexOf('/') + 1)
    let score = 0
    if (base === q) score = 100
    else if (base.startsWith(q)) score = 80
    else if (base.includes(q)) score = 60
    else if (lower.includes(q)) score = 40
    else continue
    // 同样匹配时，路径短的更可能是要找的
    scored.push({ file, score: score - Math.min(20, file.length / 10) })
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map((item) => item.file)
}
