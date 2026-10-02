import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import YAML from 'yaml'
import { t } from '@shared/i18n'
import type { CapKind, CapState } from '@shared/types'
import { getConfig } from './config'
import { AGENT_DIR, DESKTOP_DIR, readJson, writeJson } from './env'
import { PiProcess } from './rpc'

/** 目录里的一项能力，还没叠加用户的开关设置 */
export interface CatalogItem {
  id: string
  kind: CapKind
  name: string
  summary: string
  description?: string
  path?: string
  defaultState: CapState
  tri: boolean
}

interface ProbedSkill {
  name: string
  description: string
  path: string
}

interface Summary {
  label?: string
  summary?: string
}

const SUMMARIES_FILE = path.join(DESKTOP_DIR, 'summaries.json')
const BUILTIN_TOOLS: { name: string; label: string; summary: string }[] = [
  { name: 'read', label: '读文件', summary: '读取文本文件和图片' },
  { name: 'bash', label: '运行命令', summary: '在终端里执行命令' },
  { name: 'edit', label: '改文件', summary: '修改已有文件的内容' },
  { name: 'write', label: '写文件', summary: '新建或覆盖文件' }
]

function firstSentence(text: string | undefined): string {
  if (!text) return ''
  const flat = text.replace(/\s+/g, ' ').trim()
  const cut = flat.search(/[。.!?！？;；](\s|$)/)
  const sentence = cut > 0 ? flat.slice(0, cut) : flat
  return sentence.length > 60 ? `${sentence.slice(0, 58)}…` : sentence
}

function readFrontmatter(file: string): { name?: string; description?: string } {
  try {
    const head = fs.readFileSync(file, 'utf8').slice(0, 8000)
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(head)
    if (!match) return {}
    const data = YAML.parse(match[1])
    return { name: data?.name, description: typeof data?.description === 'string' ? data.description : undefined }
  } catch {
    return {}
  }
}

// ---- 技能 ----

const probeCache = new Map<string, { at: number; skills: ProbedSkill[] }>()
const probing = new Map<string, Promise<ProbedSkill[]>>()
const probeFile = () => path.join(app.getPath('userData'), 'skill-probe.json')
/** 缓存按「Pi 配置目录 + 项目目录」区分，换了配置目录不会读到别人的结果 */
const probeKey = (cwd: string) => `${AGENT_DIR}\n${cwd}`

/**
 * 问 Pi 本身：在这个项目目录下，默认会加载哪些技能。
 * 这样全局、项目、插件包带来的技能和重名覆盖都以 Pi 的判断为准，不用自己重新实现一遍。
 */
async function probeSkills(cwd: string): Promise<ProbedSkill[]> {
  const running = probing.get(cwd)
  if (running) return running
  const task = (async () => {
    const proc = new PiProcess(cwd, ['--no-session', '--no-extensions'])
    try {
      await proc.start()
      const data = await proc.request<{ commands: any[] }>({ type: 'get_commands' })
      const skills = data.commands
        .filter((c) => c.source === 'skill' && c.sourceInfo?.path)
        .map((c) => ({ name: String(c.name).replace(/^skill:/, ''), description: c.description ?? '', path: c.sourceInfo.path as string }))
      probeCache.set(cwd, { at: Date.now(), skills })
      const disk = readJson<Record<string, ProbedSkill[]>>(probeFile(), {})
      disk[probeKey(cwd)] = skills
      writeJson(probeFile(), disk)
      return skills
    } finally {
      proc.kill()
      probing.delete(cwd)
    }
  })()
  probing.set(cwd, task)
  return task
}

/** 项目的信任状态变了，之前问到的技能清单作废 */
export function forgetProbe(cwd: string): void {
  probeCache.delete(cwd)
  const disk = readJson<Record<string, ProbedSkill[]>>(probeFile(), {})
  if (probeKey(cwd) in disk) {
    delete disk[probeKey(cwd)]
    writeJson(probeFile(), disk)
  }
}

async function defaultSkills(cwd: string): Promise<ProbedSkill[]> {
  const hit = probeCache.get(cwd)
  if (hit) {
    // 超过一分钟就在后台刷新，本次先用旧结果
    if (Date.now() - hit.at > 60_000) void probeSkills(cwd).catch(() => {})
    return hit.skills
  }
  const disk = readJson<Record<string, ProbedSkill[]>>(probeFile(), {})[probeKey(cwd)]
  if (disk) {
    probeCache.set(cwd, { at: 0, skills: disk })
    void probeSkills(cwd).catch(() => {})
    return disk
  }
  return probeSkills(cwd)
}

/**
 * 用户在设置里添加的「额外技能文件夹」里的技能：默认关着，可以在对话里按需打开。
 * 适合放平时不想让 Pi 自动加载、偶尔才用的技能。没添加任何文件夹时这里是空的。
 */
function extraSkills(): ProbedSkill[] {
  const out: ProbedSkill[] = []
  for (const dir of getConfig().extraSkillDirs) {
    let names: string[] = []
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      const file = path.join(dir, name, 'SKILL.md')
      if (!fs.existsSync(file)) continue
      const meta = readFrontmatter(file)
      out.push({ name: meta.name ?? name, description: meta.description ?? '', path: file })
    }
  }
  return out
}

// ---- 扩展（给 Pi 加工具的插件）----

interface ExtensionInfo {
  name: string
  path: string
  description?: string
  enabled: boolean
}

function packageDir(source: string): string | undefined {
  if (source.startsWith('npm:')) return path.join(AGENT_DIR, 'npm', 'node_modules', source.slice(4).replace(/@[^/@]+$/, ''))
  if (source.startsWith('git:')) return path.join(AGENT_DIR, 'git', source.slice(4).replace(/@[^/@]+$/, ''))
  if (source.startsWith('~')) return path.join(process.env.HOME ?? '', source.slice(1))
  return path.resolve(AGENT_DIR, source)
}

function listExtensions(): ExtensionInfo[] {
  const out: ExtensionInfo[] = []
  const settings = readJson<{ packages?: (string | { source: string; extensions?: string[] })[] }>(path.join(AGENT_DIR, 'settings.json'), {})
  for (const entry of settings.packages ?? []) {
    const source = typeof entry === 'string' ? entry : entry.source
    const dir = packageDir(source)
    if (!dir || !fs.existsSync(dir)) continue
    const pkg = readJson<{ name?: string; description?: string; pi?: { extensions?: string[] } }>(path.join(dir, 'package.json'), {})
    const declares = (pkg.pi?.extensions?.length ?? 0) > 0 || fs.existsSync(path.join(dir, 'extensions'))
    if (!declares) continue
    const filteredOut = typeof entry === 'object' && Array.isArray(entry.extensions) && entry.extensions.length === 0
    out.push({ name: pkg.name ?? path.basename(dir), path: dir, description: pkg.description, enabled: !filteredOut })
  }
  const local = path.join(AGENT_DIR, 'extensions')
  let files: string[] = []
  try {
    files = fs.readdirSync(local)
  } catch {
    // 没有本地扩展目录
  }
  for (const file of files) {
    const full = path.join(local, file)
    const isScript = /\.(ts|js|mjs)$/.test(file)
    const isDir = !isScript && fs.existsSync(path.join(full, 'index.ts'))
    if (isScript || isDir) out.push({ name: file.replace(/\.(ts|js|mjs)$/, ''), path: full, enabled: true })
  }
  return out
}

/**
 * 只在桌面端加载的扩展：放在这个文件夹里的 Pi 扩展不进 Pi 自己的配置，
 * 命令行和别的界面不会加载它们，每次由桌面端启动 Pi 时显式带上。默认是空的。
 */
export const DESKTOP_EXT_PREFIX = 'ext:desktop:'
export const DESKTOP_EXT_DIR = path.join(DESKTOP_DIR, 'extensions')

function listDesktopExtensions(): ExtensionInfo[] {
  let files: string[] = []
  try {
    files = fs.readdirSync(DESKTOP_EXT_DIR)
  } catch {
    return []
  }
  const out: ExtensionInfo[] = []
  for (const file of files) {
    const full = path.join(DESKTOP_EXT_DIR, file)
    const isScript = /\.(ts|js|mjs)$/.test(file)
    const isDir = !isScript && fs.existsSync(path.join(full, 'index.ts'))
    if (isScript || isDir) out.push({ name: file.replace(/\.(ts|js|mjs)$/, ''), path: full, enabled: true })
  }
  return out
}

// ---- MCP ----

export const MCP_CONFIG = path.join(AGENT_DIR, 'mcp.json')

function listMcpServers(): { name: string; enabled: boolean; hint: string }[] {
  const config = readJson<{ mcpServers?: Record<string, { command?: string; url?: string; disabled?: boolean }> }>(MCP_CONFIG, {})
  return Object.entries(config.mcpServers ?? {}).map(([name, server]) => ({
    name,
    enabled: server.disabled !== true,
    hint: server.url ?? (server.command ? path.basename(server.command) : '')
  }))
}

// ---- 汇总 ----

export async function loadCatalog(cwd: string): Promise<CatalogItem[]> {
  const summaries = readJson<Record<string, Summary>>(SUMMARIES_FILE, {})
  const describe = (id: string, fallbackLabel: string, fallbackSummary: string) => ({
    name: summaries[id]?.label ?? fallbackLabel,
    summary: summaries[id]?.summary ?? fallbackSummary
  })
  const items: CatalogItem[] = []

  let active: ProbedSkill[] = []
  try {
    active = await defaultSkills(cwd)
  } catch {
    // 探测失败时只显示额外文件夹里的技能，不让整个面板打不开
  }
  const seen = new Set<string>()
  const pushSkill = (skill: ProbedSkill, defaultState: CapState) => {
    if (seen.has(skill.name)) return
    seen.add(skill.name)
    const id = `skill:${skill.name}`
    items.push({ id, kind: 'skill', ...describe(id, skill.name, firstSentence(skill.description)), name: skill.name, description: skill.description, path: skill.path, defaultState, tri: true })
  }
  for (const skill of active) pushSkill(skill, 'auto')
  for (const skill of extraSkills()) pushSkill(skill, 'off')

  for (const server of listMcpServers()) {
    const id = `mcp:${server.name}`
    items.push({ id, kind: 'mcp', ...describe(id, server.name, server.hint), defaultState: server.enabled ? 'on' : 'off', tri: false })
  }

  for (const tool of BUILTIN_TOOLS) {
    // 这张表在模块加载时就定了，文字要到用的时候再翻译，语言才跟得上设置
    items.push({ id: `tool:${tool.name}`, kind: 'tool', name: t(tool.label), summary: t(tool.summary), defaultState: 'on', tri: false })
  }
  for (const ext of listExtensions()) {
    const id = `ext:${ext.name}`
    items.push({ id, kind: 'tool', ...describe(id, ext.name, firstSentence(ext.description)), path: ext.path, defaultState: ext.enabled ? 'on' : 'off', tri: false })
  }
  for (const ext of listDesktopExtensions()) {
    const id = `${DESKTOP_EXT_PREFIX}${ext.name}`
    items.push({ id, kind: 'tool', ...describe(id, ext.name, ''), path: ext.path, defaultState: 'on', tri: false })
  }
  return items
}
