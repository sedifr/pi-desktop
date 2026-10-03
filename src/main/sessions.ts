import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { Msg, SearchHit, SessionData, SessionMeta, Usage, UsageTotals } from '@shared/types'
import { t } from '@shared/i18n'
import { AGENT_DIR, DESKTOP_DIR, readJson, writeJson } from './env'

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
        images.push({ path: m.details.path, prompt: typeof m.details.prompt === 'string' ? m.details.prompt : undefined, tool: m.toolName })
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
const cacheFile = () => path.join(app.getPath('userData'), 'session-index-v5.json')

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

function slimDetails(details: Entry | undefined): Record<string, unknown> | undefined {
  if (!details) return undefined
  const out: Record<string, unknown> = {}
  if (typeof details.path === 'string') out.path = details.path
  if (typeof details.patch === 'string' && details.patch.length < 200_000) out.patch = details.patch
  return Object.keys(out).length ? out : undefined
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
    // 大多数工具的 details 很大且界面用不到，只留两样：文件存到了哪、改文件工具改了什么
    details: slimDetails(message.details),
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

/** 子代理自己的会话：名字形如 Explore#d0c8da8a */
const SUBAGENT = /#[0-9a-f]{8}$/

/**
 * 一个项目的会话存在哪个文件夹。Pi 按项目路径给文件夹起名，这里用的是和内核一样的算法。
 * 算出来的文件夹不存在、而这个项目明明已经有对话时，说明内核换了起名办法，就跟着已有的对话放。
 */
function sessionDirFor(cwd: string, known: SessionMeta[]): string {
  const dir = path.join(SESSIONS_DIR, `--${cwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`)
  if (fs.existsSync(dir)) return dir
  const sibling = known.find((meta) => meta.cwd && path.resolve(meta.cwd) === cwd && !SUBAGENT.test(meta.name ?? ''))
  return sibling ? path.dirname(sibling.file) : dir
}

/**
 * 改会话文件开头那一行（它属于哪个项目、从哪个对话来），需要的话把文件挪到新项目的文件夹里。
 * 后面的对话内容一个字节都不动。先挪后改，中途出错也只会有一份，不会多出来或者丢掉。
 */
function relocate(file: string, patch: { cwd?: string; parentSession?: string }, dir?: string): string {
  const stat = fs.statSync(file)
  const raw = fs.readFileSync(file)
  const end = raw.indexOf(0x0a)
  let header: Entry | undefined
  try {
    header = JSON.parse(raw.subarray(0, end < 0 ? raw.length : end).toString('utf8'))
  } catch {
    // 下面一并报错
  }
  if (!header || header.type !== 'session') throw new Error(t('这个会话文件的开头读不懂，没有动它'))
  const dest = dir ? path.join(dir, path.basename(file)) : file
  if (dest !== file) {
    if (fs.existsSync(dest)) throw new Error(t('目标项目里已经有一个同名的会话文件'))
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.renameSync(file, dest)
  }
  const temp = `${dest}.moving`
  try {
    fs.writeFileSync(temp, Buffer.concat([Buffer.from(JSON.stringify({ ...header, ...patch }), 'utf8'), end < 0 ? Buffer.from('\n') : raw.subarray(end)]), { mode: stat.mode })
    // 保留原来的修改时间：侧栏按它排序，挪一下不该让对话跳到最前面
    fs.utimesSync(temp, stat.atime, stat.mtime)
    fs.renameSync(temp, dest)
  } catch (error) {
    fs.rmSync(temp, { force: true })
    if (dest !== file) fs.renameSync(dest, file)
    throw error
  }
  return dest
}

/**
 * 把一个对话移到另一个项目：以后在那个项目的文件夹里接着做，命令行里也归到那个项目下。
 * 它开过的子代理记录跟着走。对话里已经写好、改过的文件不动。
 */
export function moveSession(file: string, cwd: string): string {
  const target = path.resolve(cwd)
  let isDir = false
  try {
    isDir = fs.statSync(target).isDirectory()
  } catch {
    // 不存在
  }
  if (!isDir) throw new Error(t('项目文件夹不存在：{path}', { path: target }))
  const known = listSessions()
  const dir = sessionDirFor(target, known)
  const dest = relocate(file, { cwd: target }, dir)
  const follow = (from: string, to: string): void => {
    for (const child of known) {
      if (child.parentSession !== from || !SUBAGENT.test(child.name ?? '')) continue
      try {
        follow(child.file, relocate(child.file, { cwd: target, parentSession: to }, dir))
      } catch {
        // 跟不过去的留在原处，不影响主对话
      }
    }
  }
  follow(file, dest)
  return dest
}

// ---- 搜索 ----

interface TextPart {
  id: string
  role: 'user' | 'assistant'
  text: string
  lower: string
}

/**
 * 每个对话里双方说过的话，搜索时用。只放在内存里：工具输出和图片不算，量不大；
 * 第一次搜索时读一遍，之后只重读变过的文件。
 */
const textIndex = new Map<string, { size: number; mtime: number; parts: TextPart[] }>()
let indexing: Promise<void> = Promise.resolve()

function textParts(file: string): TextPart[] {
  const parts: TextPart[] = []
  for (const e of parseLines(file)) {
    const m = e.type === 'message' ? e.message : undefined
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || !e.id) continue
    const text = textOf(m.content).trim()
    if (text) parts.push({ id: e.id, role: m.role, text, lower: text.toLowerCase() })
  }
  return parts
}

async function syncTextIndex(entries: Record<string, CacheEntry>): Promise<void> {
  for (const file of [...textIndex.keys()]) if (!entries[file]) textIndex.delete(file)
  let since = Date.now()
  for (const [file, entry] of Object.entries(entries)) {
    const hit = textIndex.get(file)
    if (hit && hit.size === entry.size && hit.mtime === entry.mtime) continue
    try {
      textIndex.set(file, { size: entry.size, mtime: entry.mtime, parts: SUBAGENT.test(entry.meta.name ?? '') ? [] : textParts(file) })
    } catch {
      textIndex.delete(file)
    }
    // 对话很多时别把主进程占住太久，隔一会儿让别的事先做
    if (Date.now() - since > 30) {
      await new Promise((resolve) => setImmediate(resolve))
      since = Date.now()
    }
  }
}

function snippetAround(part: TextPart, at: number, length: number): string {
  const from = Math.max(0, at - 28)
  const to = Math.min(part.text.length, at + length + 90)
  return `${from > 0 ? '…' : ''}${part.text.slice(from, to).replace(/\s+/g, ' ').trim()}${to < part.text.length ? '…' : ''}`
}

/**
 * 找对话：标题、项目名、对话里双方说过的话都算。多个词要全部出现（不必在同一处）。
 * 标题里就能对上的排前面，其余按最近用过的排。
 */
export async function searchSessions(query: string, limit = 50): Promise<SearchHit[]> {
  const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))]
  if (!terms.length) return []
  const entries = refresh()
  await (indexing = indexing.then(() => syncTextIndex(entries)))
  const found: { hit: SearchHit; rank: number; modified: number }[] = []
  for (const entry of Object.values(entries)) {
    const meta = entry.meta
    if (!meta.cwd || SUBAGENT.test(meta.name ?? '')) continue
    const title = (meta.name ?? meta.firstUserText ?? '').toLowerCase()
    const project = path.basename(meta.cwd).toLowerCase()
    const parts = textIndex.get(meta.file)?.parts ?? []
    const inTitle = terms.filter((term) => title.includes(term)).length
    if (!terms.every((term) => title.includes(term) || project.includes(term) || parts.some((part) => part.lower.includes(term)))) continue
    const hit: SearchHit = { file: meta.file }
    if (inTitle < terms.length) {
      // 挑对上的词最多的那条消息给人看；一样多就取最早的
      let best: TextPart | undefined
      let bestCount = 0
      for (const part of parts) {
        const count = terms.filter((term) => part.lower.includes(term)).length
        if (count > bestCount) [best, bestCount] = [part, count]
      }
      if (best) {
        const term = terms.find((item) => best.lower.includes(item)) ?? terms[0]
        hit.entryId = best.id
        hit.role = best.role
        hit.snippet = snippetAround(best, best.lower.indexOf(term), term.length)
      }
    }
    found.push({ hit, rank: inTitle === terms.length ? 0 : 1, modified: meta.modified })
  }
  return found
    .sort((a, b) => a.rank - b.rank || b.modified - a.modified)
    .slice(0, limit)
    .map((item) => item.hit)
}

// ---- 对话的文字版 ----

const TRANSCRIPT_DIR = path.join(DESKTOP_DIR, 'transcripts')
const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)}…` : text)

/** 一次工具调用压成一行：名字加上最要紧的参数 */
function toolLine(call: Entry): string {
  const args = call.arguments ?? {}
  const main = args.command ?? args.path ?? args.file_path ?? args.query ?? args.url ?? args.pattern
  const detail = typeof main === 'string' ? main : JSON.stringify(args)
  return `- ${t('调用工具')} \`${call.name}\`：${clip(String(detail ?? '').replace(/\s+/g, ' '), 200)}`
}

/**
 * 把一个对话整理成一份给模型读的文字记录：双方的话原样保留，工具调用各留一行，
 * 工具输出截短，思考过程和图片不要。存成文件，谁要参考这个对话就读它，比读原始会话文件省得多。
 * 同一个对话每次都写到同一个文件，内容是当时最新的。
 */
export function writeTranscript(file: string): string {
  const data = readSession(file)
  const first = data.messages.find((message) => message.role === 'user')
  const title = data.meta.name ?? clip(textOf(first?.content).replace(/\s+/g, ' ').trim(), 60) ?? ''
  const out: string[] = [
    `# ${t('对话记录')}：${title || t('（空对话）')}`,
    '',
    `- ${t('项目文件夹')}：${data.meta.cwd}`,
    `- ${t('原始会话文件（Pi 的 JSONL 格式，含完整的工具输出）')}：${file}`,
    `- ${t('这份记录由 Pi Desktop 整理：双方的话原样保留，工具调用各留一行，工具输出截短，思考过程和图片略去。')}`,
    ''
  ]
  let speaker = ''
  const say = (who: string): void => {
    if (who !== speaker) out.push(`## ${who}`, '')
    speaker = who
  }
  for (const message of data.messages) {
    const blocks: Entry[] = Array.isArray(message.content) ? (message.content as Entry[]) : []
    if (message.role === 'user') {
      say(t('用户'))
      const images = blocks.filter((block) => block.type === 'image').length
      out.push(textOf(message.content).trim() || t('（没有文字）'), ...(images ? [`（${t('附了 {n} 张图片', { n: images })}）`] : []), '')
    } else if (message.role === 'assistant') {
      say('Pi')
      for (const block of blocks) {
        if (block.type === 'text' && block.text?.trim()) {
          // 上面是工具那几行的话，空一行再接正文
          if (out[out.length - 1] !== '') out.push('')
          out.push(block.text.trim(), '')
        } else if (block.type === 'toolCall') out.push(toolLine(block))
      }
      if (message.stopReason === 'error' && message.errorMessage) out.push(`（${t('出错了：{error}', { error: message.errorMessage })}）`, '')
    } else if (message.role === 'toolResult') {
      const text = textOf(message.content).replace(/\s+/g, ' ').trim()
      if (text) out.push(`  ${message.isError ? t('出错') : t('结果')}：${clip(text, 300)}`)
    } else if (message.role === 'bashExecution') {
      say(t('用户'))
      out.push(`${t('用户自己运行了命令')}：\`${message.command ?? ''}\``, '', '```', clip(String(message.output ?? '').trim(), 1500), '```', '')
    } else if (message.role === 'compactionSummary' || message.role === 'branchSummary') {
      say(t('更早内容的摘要'))
      out.push(String(message.summary ?? '').trim(), '')
    }
  }
  // 文件名只留文字和数字：带标点或空格的路径，模型读起来容易出岔子
  const safe = title
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .slice(0, 24)
    .replace(/^-+|-+$/g, '')
  fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true })
  const target = path.join(TRANSCRIPT_DIR, `${safe || 'conversation'}-${String(data.meta.id ?? '').slice(-8) || 'pi'}.md`)
  fs.writeFileSync(target, `${out.join('\n').replace(/\n{3,}/g, '\n\n')}\n`)
  return target
}
