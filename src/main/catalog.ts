import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import YAML from 'yaml'
import { t } from '@shared/i18n'
import type { CapKind, CapState } from '@shared/types'
import { getConfig } from './config'
import { AGENT_DIR, DESKTOP_DIR, HOME, readJson, readJsonForEdit, writeJson } from './env'
import { trustStatus } from './trust'
import { PiProcess } from './rpc'

/** 目录里的一项能力，还没叠加用户的开关设置 */
export interface CatalogItem {
  id: string
  kind: CapKind
  name: string
  summary: string
  description?: string
  path?: string
  /** 扩展包只加载其中这几个文件时，是哪几个 */
  paths?: string[]
  defaultState: CapState
  tri: boolean
  /** 没法按对话开关，状态固定是默认值 */
  locked?: boolean
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

/** 这一项有没有用户自己写（或让模型写）过的简介 */
export function hasOwnSummary(id: string): boolean {
  return Boolean(readJson<Record<string, Summary>>(SUMMARIES_FILE, {})[id]?.summary)
}

/** 改一项在界面上显示的那句简介。留空就是去掉自己写的，回到它自带的说明 */
export function setSummary(id: string, summary: string): void {
  const all = readJsonForEdit<Record<string, Summary>>(SUMMARIES_FILE)
  const text = summary.trim()
  if (text) all[id] = { ...all[id], summary: text }
  else if (all[id]) {
    delete all[id].summary
    if (!all[id].label) delete all[id]
  }
  writeJson(SUMMARIES_FILE, all)
}
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
  const generation = probeGeneration
  const task = (async () => {
    const proc = new PiProcess(cwd, ['--no-session', '--no-extensions'])
    // Pi 迟迟不回应时不能让后面所有读清单的地方都跟着等
    const timer = setTimeout(() => proc.kill(), 30_000)
    try {
      await proc.start()
      const data = await proc.request<{ commands: any[] }>({ type: 'get_commands' })
      const skills = data.commands
        .filter((c) => c.source === 'skill' && c.sourceInfo?.path)
        .map((c) => ({ name: String(c.name).replace(/^skill:/, ''), description: c.description ?? '', path: c.sourceInfo.path as string }))
      // 问的这会儿清单被作废过（信任变了、装卸了包），这份就是旧的，不能当新的存
      if (generation === probeGeneration) {
        probeCache.set(cwd, { at: Date.now(), skills })
        const disk = readJson<Record<string, ProbedSkill[]>>(probeFile(), {})
        disk[probeKey(cwd)] = skills
        writeJson(probeFile(), disk)
      }
      probeFailed.delete(cwd)
      return skills
    } catch (error) {
      probeFailed.add(cwd)
      throw error
    } finally {
      clearTimeout(timer)
      proc.kill()
      probing.delete(cwd)
    }
  })()
  probing.set(cwd, task)
  return task
}

/** 每作废一次加一，用来认出「作废之前就出发」的探测 */
let probeGeneration = 0
/**
 * 问不出技能清单的项目目录（比如 Pi 在这种状态下起不来）。
 * 这时启动对话不能再拿一份空清单去顶替 Pi 自己的发现，否则技能就全没了。
 */
const probeFailed = new Set<string>()
export const skillsUnknown = (cwd: string): boolean => probeFailed.has(cwd) && !probeCache.has(cwd)

/** 装了或卸了包以后，所有项目之前问到的技能清单都作废 */
export function forgetAllProbes(): void {
  probeGeneration++
  probing.clear()
  probeCache.clear()
  writeJson(probeFile(), {})
}

/** 项目的信任状态变了，之前问到的技能清单作废 */
export function forgetProbe(cwd: string): void {
  probeGeneration++
  probing.delete(cwd)
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
  /** 只加载包里的这几个文件，而不是整个包 */
  paths?: string[]
  description?: string
  enabled: boolean
}

function packageDir(source: string): string | undefined {
  if (source.startsWith('npm:')) return path.join(AGENT_DIR, 'npm', 'node_modules', source.slice(4).replace(/@[^/@]+$/, ''))
  // git 来源有几种写法：git:主机/路径、https://主机/路径、ssh://git@主机/路径、git@主机:路径。Pi 都放在 git/主机/路径 下
  const git = /^(?:git:|https?:\/\/|ssh:\/\/)(?:[^@/]+@)?(.+)$/.exec(source)
  if (git) {
    const rest = git[1]
      .replace(/^([^/:]+):(?!\d)/, '$1/')
      .replace(/@[^/@]+$/, '')
      .replace(/\.git$/, '')
    return path.join(AGENT_DIR, 'git', rest)
  }
  if (source.startsWith('~')) return path.join(HOME, source.slice(1))
  return path.resolve(AGENT_DIR, source)
}

/** 一个文件夹里直接放着的扩展：单个脚本，或者带 index.ts 的子文件夹 */
function extensionsIn(dir: string): ExtensionInfo[] {
  let files: string[] = []
  try {
    files = fs.readdirSync(dir)
  } catch {
    return []
  }
  const out: ExtensionInfo[] = []
  for (const file of files) {
    const full = path.join(dir, file)
    const isScript = /\.(ts|js|mjs)$/.test(file)
    const isDir = !isScript && fs.existsSync(path.join(full, 'index.ts'))
    if (isScript || isDir) out.push({ name: file.replace(/\.(ts|js|mjs)$/, ''), path: full, enabled: true })
  }
  return out
}

function listExtensions(): ExtensionInfo[] {
  const out: ExtensionInfo[] = []
  const settings = readJson<{ packages?: (string | { source: string; extensions?: string[] })[]; extensions?: string[] }>(path.join(AGENT_DIR, 'settings.json'), {})
  for (const entry of settings.packages ?? []) {
    const source = typeof entry === 'string' ? entry : entry.source
    const dir = packageDir(source)
    if (!dir || !fs.existsSync(dir)) continue
    const pkg = readJson<{ name?: string; description?: string; pi?: { extensions?: string[] } }>(path.join(dir, 'package.json'), {})
    const declares = (pkg.pi?.extensions?.length ?? 0) > 0 || fs.existsSync(path.join(dir, 'extensions'))
    if (!declares) continue
    const filter = typeof entry === 'object' && Array.isArray(entry.extensions) ? entry.extensions : undefined
    // 设置里只挑了包里的一部分扩展、而且写的都是普通路径时，就只加载挑中的那几个；
    // 整个文件夹交给 Pi 会把没挑的也加载进来
    const picked = filter?.length && filter.every((item) => !/^[!+-]|[*?]/.test(item)) ? filter.map((item) => path.resolve(dir, item)) : undefined
    out.push({ name: pkg.name ?? path.basename(dir), path: dir, paths: picked, description: pkg.description, enabled: filter?.length !== 0 })
  }
  out.push(...extensionsIn(path.join(AGENT_DIR, 'extensions')))
  // 设置里直接写的扩展文件或文件夹
  for (const item of settings.extensions ?? []) {
    if (typeof item !== 'string' || /^[!+-]|^builtin:|[*?]/.test(item)) continue
    const full = path.resolve(AGENT_DIR, item.replace(/^~(?=\/)/, HOME))
    if (fs.existsSync(full) && !out.some((ext) => ext.path === full)) out.push({ name: path.basename(full).replace(/\.(ts|js|mjs)$/, ''), path: full, enabled: true })
  }
  return out
}

/** 项目自己带的扩展（.pi/extensions）。只有项目被信任时 Pi 才会加载它们 */
function listProjectExtensions(cwd: string): ExtensionInfo[] {
  return extensionsIn(path.join(cwd, '.pi', 'extensions'))
}

/**
 * 只在桌面端加载的扩展：放在这个文件夹里的 Pi 扩展不进 Pi 自己的配置，
 * 命令行和别的界面不会加载它们，每次由桌面端启动 Pi 时显式带上。默认是空的。
 */
export const DESKTOP_EXT_PREFIX = 'ext:desktop:'
export const PROJECT_EXT_PREFIX = 'ext:project:'
export const DESKTOP_EXT_DIR = path.join(DESKTOP_DIR, 'extensions')

function listDesktopExtensions(): ExtensionInfo[] {
  return extensionsIn(DESKTOP_EXT_DIR)
}

// ---- MCP ----

const ADAPTER = /mcp-adapter/

/** 装没装 pi-mcp-adapter 扩展 */
export function adapterInstalled(): boolean {
  return listExtensions().some((ext) => ADAPTER.test(ext.name) && ext.enabled)
}

/** 现在实际用哪种 MCP 接法：设置里选了就听设置的，没选就看装没装那个扩展 */
export function mcpEngine(extensions = listExtensions()): 'builtin' | 'adapter' {
  const installed = extensions.some((ext) => ADAPTER.test(ext.name) && ext.enabled)
  return installed && getConfig().mcpEngine !== 'builtin' ? 'adapter' : 'builtin'
}

export const MCP_CONFIG = path.join(AGENT_DIR, 'mcp.json')

function listMcpServers(): { name: string; enabled: boolean; hint: string; description?: string }[] {
  const config = readJson<{ mcpServers?: Record<string, { command?: string; url?: string; description?: string; disabled?: boolean; enabled?: boolean }> }>(MCP_CONFIG, {})
  return Object.entries(config.mcpServers ?? {}).map(([name, server]) => ({
    name,
    enabled: server.disabled !== true && server.enabled !== false,
    // 服务自己带了说明就用它，没有就显示它连的是什么
    hint: server.description || server.url || (server.command ? path.basename(server.command) : ''),
    description: server.description
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

  const extensions = listExtensions()
  // 按对话开关 MCP 服务靠的是 pi-mcp-adapter 这个扩展；Pi 自带的 MCP 只认配置文件里写的
  const adapter = mcpEngine(extensions) === 'adapter'
  for (const server of listMcpServers()) {
    const id = `mcp:${server.name}`
    items.push({ id, kind: 'mcp', ...describe(id, server.name, server.hint), description: server.description, defaultState: server.enabled ? 'on' : 'off', tri: false, locked: !adapter })
  }

  for (const tool of BUILTIN_TOOLS) {
    // 这张表在模块加载时就定了，文字要到用的时候再翻译，语言才跟得上设置
    items.push({ id: `tool:${tool.name}`, kind: 'tool', name: t(tool.label), summary: t(tool.summary), defaultState: 'on', tri: false })
  }
  for (const ext of extensions) {
    const id = `ext:${ext.name}`
    // 设置里选了 Pi 自带的 MCP 接法时，那个扩展不加载，也不让在对话里单独打开（两种接法同时在会打架）
    const parked = ADAPTER.test(ext.name) && !adapter
    items.push({
      id,
      kind: 'tool',
      ...describe(id, ext.name, firstSentence(ext.description)),
      path: ext.path,
      paths: ext.paths,
      defaultState: ext.enabled && !parked ? 'on' : 'off',
      tri: false,
      locked: parked || undefined
    })
  }
  // 项目自带的扩展只在项目被信任时才会加载，没信任时不列出来
  if ((await trustStatus(cwd).catch(() => undefined))?.trusted) {
    for (const ext of listProjectExtensions(cwd)) {
      const id = `${PROJECT_EXT_PREFIX}${ext.name}`
      items.push({ id, kind: 'tool', ...describe(id, ext.name, t('这个项目自带的扩展')), path: ext.path, defaultState: 'on', tri: false })
    }
  }
  for (const ext of listDesktopExtensions()) {
    const id = `${DESKTOP_EXT_PREFIX}${ext.name}`
    items.push({ id, kind: 'tool', ...describe(id, ext.name, ''), path: ext.path, defaultState: 'on', tri: false })
  }
  return items
}
