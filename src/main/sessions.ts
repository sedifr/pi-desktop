import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { Msg, SessionData, SessionMeta, Usage, UsageTotals } from '@shared/types'
import { AGENT_DIR, readJson, writeJson } from './env'

const SESSIONS_DIR = path.join(AGENT_DIR, 'sessions')

interface Bucket {
  day: string
  model: string
  usage: Usage
}

/** 对话里某个工具存下来的一张图 */
interface SavedImage {
  path: string
  prompt?: string
  tool?: string
}

interface CacheEntry {
  size: number
  mtime: number
  meta: SessionMeta
  buckets: Bucket[]
  images: SavedImage[]
}

type Entry = Record<string, any>

const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 })

function addUsage(target: Usage, u: any): void {
  if (!u) return
  target.input += u.input ?? 0
  target.output += u.output ?? 0
  target.cacheRead += u.cacheRead ?? 0
  target.cacheWrite += u.cacheWrite ?? 0
  target.cost += (typeof u.cost === 'number' ? u.cost : u.cost?.total) ?? 0
}

function parseLines(file: string): Entry[] {
  const out: Entry[] = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // 写到一半的行，跳过
    }
  }
  return out
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b?.type === 'text')
      .map((b) => b.text)
      .join('\n')
  }
  return ''
}

function localDay(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 从别的对话另开出来的会话，文件开头是把原对话那一段整个抄过来的，时间还是原来的时间。
 * 那部分的花费已经算在原对话头上了，这里按「比这个会话的创建时间还早」认出来，不再算一遍。
 */
function inheritedBefore(header: Entry): (timestamp: unknown) => boolean {
  const created = header.parentSession ? Date.parse(header.timestamp) : NaN
  if (Number.isNaN(created)) return () => false
  return (timestamp) => {
    const at = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN
    return !Number.isNaN(at) && at < created
  }
}

function scanFile(file: string, stat: fs.Stats): CacheEntry | undefined {
  const entries = parseLines(file)
  const header = entries[0]
  if (!header || header.type !== 'session') return undefined
  const meta: SessionMeta = {
    file,
    id: header.id,
    cwd: header.cwd ?? '',
    created: header.timestamp,
    modified: stat.mtimeMs,
    messageCount: 0,
    parentSession: header.parentSession,
    usage: emptyUsage()
  }
  const buckets = new Map<string, Bucket>()
  const inherited = inheritedBefore(header)
  const count = (u: any, model: string, timestamp: string) => {
    if (!u || inherited(timestamp)) return
    addUsage(meta.usage, u)
    const day = localDay(timestamp)
    const key = `${day}|${model}`
    let bucket = buckets.get(key)
    if (!bucket) buckets.set(key, (bucket = { day, model, usage: emptyUsage() }))
    addUsage(bucket.usage, u)
  }
  const images: SavedImage[] = []
  for (const e of entries) {
    if (e.type === 'message' && e.message) {
      const m = e.message
      if (m.role === 'system') continue
      // 出图工具会在结果里说明图片存到了哪
      if (m.role === 'toolResult' && !m.isError && typeof m.details?.path === 'string' && /\.(png|jpe?g|webp|gif)$/i.test(m.details.path)) {
        images.push({ path: m.details.path, prompt: typeof m.details.prompt === 'string' ? m.details.prompt.slice(0, 600) : undefined, tool: m.toolName })
      }
      meta.messageCount++
      if (m.role === 'user' && !meta.firstUserText) meta.firstUserText = textOf(m.content).slice(0, 200)
      count(m.usage, m.model ?? '@other', e.timestamp)
    } else if (e.type === 'session_info' && typeof e.name === 'string') {
      meta.name = e.name
    } else if (e.usage) {
      count(e.usage, e.model ?? '@summaries', e.timestamp)
    }
  }
  return { size: stat.size, mtime: stat.mtimeMs, meta, buckets: [...buckets.values()], images }
}

let cache: Record<string, CacheEntry> | undefined
const cacheFile = () => path.join(app.getPath('userData'), 'session-index-v4.json')

function refresh(): Record<string, CacheEntry> {
  cache ??= readJson<Record<string, CacheEntry>>(cacheFile(), {})
  const next: Record<string, CacheEntry> = {}
  let changed = false
  let dirs: string[] = []
  try {
    dirs = fs.readdirSync(SESSIONS_DIR)
  } catch {
    // 还没有任何会话
  }
  for (const dir of dirs) {
    const full = path.join(SESSIONS_DIR, dir)
    let files: string[]
    try {
      files = fs.readdirSync(full)
    } catch {
      continue
    }
    for (const name of files) {
      if (!name.endsWith('.jsonl')) continue
      const file = path.join(full, name)
      try {
        const stat = fs.statSync(file)
        const hit = cache[file]
        if (hit && hit.size === stat.size && hit.mtime === stat.mtimeMs) {
          next[file] = hit
          continue
        }
        const scanned = scanFile(file, stat)
        if (scanned) next[file] = scanned
        changed = true
      } catch {
        // 文件正被写入或已删除
      }
    }
  }
  if (changed || Object.keys(next).length !== Object.keys(cache).length) writeJson(cacheFile(), next)
  cache = next
  return next
}

export function listSessions(): SessionMeta[] {
  return Object.values(refresh())
    .map((entry) => entry.meta)
    .sort((a, b) => b.modified - a.modified)
}

/** 每个对话存下过哪些图片，给图库用 */
export function sessionImages(): { file: string; cwd: string; title?: string; images: SavedImage[] }[] {
  return Object.values(refresh())
    .filter((entry) => entry.images?.length)
    .map((entry) => ({ file: entry.meta.file, cwd: entry.meta.cwd, title: entry.meta.name ?? entry.meta.firstUserText, images: entry.images }))
}

export function usageTotals(): UsageTotals {
  const today = localDay(undefined)
  const month = today.slice(0, 7)
  const totals: UsageTotals = { today: emptyUsage(), month: emptyUsage(), byModel: [] }
  const byModel = new Map<string, Usage>()
  for (const entry of Object.values(refresh())) {
    for (const bucket of entry.buckets) {
      if (!bucket.day.startsWith(month)) continue
      addUsage(totals.month, bucket.usage)
      if (bucket.day === today) addUsage(totals.today, bucket.usage)
      let slot = byModel.get(bucket.model)
      if (!slot) byModel.set(bucket.model, (slot = emptyUsage()))
      addUsage(slot, bucket.usage)
    }
  }
  totals.byModel = [...byModel.entries()].map(([model, usage]) => ({ model, usage })).sort((a, b) => b.usage.cost - a.usage.cost)
  return totals
}

function slimMessage(message: Entry, entryId: string): Msg {
  const content = Array.isArray(message.content)
    ? message.content.map((block: Entry) => {
        // 思考签名只给模型用，体积很大，界面不需要
        const { thinkingSignature: _sig, ...rest } = block
        return rest
      })
    : message.content
  return {
    entryId,
    role: message.role,
    content,
    toolCallId: message.toolCallId,
    toolName: message.toolName,
    isError: message.isError,
    model: message.model,
    provider: message.provider,
    stopReason: message.stopReason,
    errorMessage: message.errorMessage,
    timestamp: message.timestamp,
    usage: message.usage,
    // 大多数工具的 details 很大且界面用不到，只留「文件存到了哪」这一项
    details: typeof message.details?.path === 'string' ? { path: message.details.path } : undefined,
    ...(message.role === 'bashExecution'
      ? {
          command: message.command,
          output: message.output,
          exitCode: message.exitCode,
          cancelled: message.cancelled,
          truncated: message.truncated,
          fullOutputPath: message.fullOutputPath,
          excludeFromContext: message.excludeFromContext
        }
      : {})
  }
}

/** 读出会话当前分支上的消息，供界面立即显示，不需要先启动 Pi 进程 */
export function readSession(file: string): SessionData {
  const entries = parseLines(file)
  const header = entries[0] ?? {}
  const byId = new Map<string, Entry>()
  for (const e of entries) if (e.id) byId.set(e.id, e)

  // 会话是一棵树：从最后一条往上走到根，就是当前分支
  const branch: Entry[] = []
  const seen = new Set<string>()
  let cursor: Entry | undefined = entries.length > 1 ? entries[entries.length - 1] : undefined
  while (cursor && cursor.id && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    branch.push(cursor)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  branch.reverse()

  const data: SessionData = {
    meta: { id: header.id, cwd: header.cwd ?? '' },
    messages: [],
    usage: emptyUsage()
  }
  const inherited = inheritedBefore(header)
  for (const e of entries) {
    if (e.type === 'session_info' && typeof e.name === 'string') data.meta.name = e.name
    if (inherited(e.timestamp)) continue
    if (e.type === 'message') addUsage(data.usage, e.message?.usage)
    else if (e.usage) addUsage(data.usage, e.usage)
  }
  for (const e of branch) {
    if (e.type === 'message' && e.message) {
      const m = e.message
      if (m.role === 'system') continue
      data.messages.push(slimMessage(m, e.id))
      if (m.role === 'assistant' && m.usage) {
        const u = m.usage
        data.contextTokens = (u.input ?? 0) + (u.output ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0)
        data.model = { provider: m.provider, id: m.model }
      }
    } else if (e.type === 'compaction') {
      data.messages.push({ entryId: e.id, role: 'compactionSummary', summary: e.summary })
    } else if (e.type === 'branch_summary') {
      data.messages.push({ entryId: e.id, role: 'branchSummary', summary: e.summary })
    } else if (e.type === 'custom_message' && e.display) {
      data.messages.push({ entryId: e.id, role: 'custom', customType: e.customType, content: e.content, display: true })
    } else if (e.type === 'model_change') {
      data.model = { provider: e.provider, id: e.modelId }
    } else if (e.type === 'thinking_level_change') {
      data.thinkingLevel = e.thinkingLevel
    }
  }
  return data
}
