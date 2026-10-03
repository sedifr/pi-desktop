import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { CapItem, CapState } from '@shared/types'
import { DESKTOP_EXT_PREFIX, type CatalogItem, MCP_CONFIG, loadCatalog, skillsUnknown } from './catalog'
import { DESKTOP_DIR, HOME, readJson, readOwnJson, writeJson } from './env'

type Overrides = Record<string, CapState>

interface Store {
  global: Overrides
  projects: Record<string, Overrides>
  sessions: Record<string, Overrides>
}

const BUILTIN_EXTENSIONS = ['llama.cpp', 'codemode', 'tool-search']
const STORE_FILE = path.join(DESKTOP_DIR, 'capabilities.json')
const RUN_DIR = path.join(DESKTOP_DIR, 'run')

let store: Store | undefined

function load(): Store {
  if (!store) {
    store = { global: {}, projects: {}, sessions: {}, ...readOwnJson<Partial<Store>>(STORE_FILE, {}) }
    // 会话文件已经不在了（删掉了，或新对话没发过消息），对应的设置也不用留
    for (const key of Object.keys(store.sessions)) if (!fs.existsSync(key)) delete store.sessions[key]
  }
  return store
}

function save(): void {
  writeJson(STORE_FILE, load())
}

/** 状态按「这次对话 → 本项目 → 全局 → 默认」逐层取第一个有值的 */
function resolveItems(catalog: CatalogItem[], key: string, cwd: string): CapItem[] {
  const s = load()
  const session = s.sessions[key] ?? {}
  const project = s.projects[cwd] ?? {}
  return catalog.map((item) => {
    // 没法按对话开关的项，不管以前存过什么，都按它本来的状态显示
    if (item.locked) return { ...item, state: item.defaultState, from: 'default' as const }
    if (session[item.id]) return { ...item, state: session[item.id], from: 'session' as const }
    if (project[item.id]) return { ...item, state: project[item.id], from: 'project' as const }
    if (s.global[item.id]) return { ...item, state: s.global[item.id], from: 'global' as const }
    return { ...item, state: item.defaultState, from: 'default' as const }
  })
}

export async function getItems(key: string, cwd: string): Promise<CapItem[]> {
  return resolveItems(await loadCatalog(cwd), key, cwd)
}

export async function setStates(key: string, cwd: string, changes: Overrides): Promise<CapItem[]> {
  const s = load()
  const catalog = await loadCatalog(cwd)
  const inherited = new Map(resolveItems(catalog, '', cwd).map((item) => [item.id, item.state]))
  const session = { ...(s.sessions[key] ?? {}) }
  for (const [id, state] of Object.entries(changes)) {
    // 改回和上一层一样的值时不留记录，之后上层变了它会跟着变
    if (inherited.get(id) === state) delete session[id]
    else session[id] = state
  }
  if (Object.keys(session).length) s.sessions[key] = session
  else delete s.sessions[key]
  save()
  return resolveItems(catalog, key, cwd)
}

export async function saveAs(key: string, cwd: string, scope: 'project' | 'global'): Promise<CapItem[]> {
  const s = load()
  const catalog = await loadCatalog(cwd)
  const current = resolveItems(catalog, key, cwd)
  if (scope === 'global') {
    for (const item of current) {
      if (item.state === item.defaultState) delete s.global[item.id]
      else s.global[item.id] = item.state
    }
    delete s.projects[cwd]
  } else {
    const project: Overrides = {}
    for (const item of current) {
      const base = s.global[item.id] ?? item.defaultState
      if (item.state !== base) project[item.id] = item.state
    }
    if (Object.keys(project).length) s.projects[cwd] = project
    else delete s.projects[cwd]
  }
  delete s.sessions[key]
  save()
  return resolveItems(catalog, key, cwd)
}

// 全局默认不属于任何项目。技能目录用主目录去探测，这样只列出全局可用的技能
const NO_PROJECT = '\0global'

export async function getGlobal(): Promise<CapItem[]> {
  return resolveItems(await loadCatalog(HOME), '', NO_PROJECT)
}

export async function setGlobal(changes: Overrides): Promise<CapItem[]> {
  const s = load()
  const catalog = await loadCatalog(HOME)
  const defaults = new Map(catalog.map((item) => [item.id, item.defaultState]))
  for (const [id, state] of Object.entries(changes)) {
    if (defaults.get(id) === state) delete s.global[id]
    else s.global[id] = state
  }
  save()
  return resolveItems(catalog, '', NO_PROJECT)
}

export async function resetSession(key: string, cwd: string): Promise<CapItem[]> {
  const s = load()
  delete s.sessions[key]
  save()
  return getItems(key, cwd)
}

/** 新对话第一次落盘后，把按临时 key 存的设置挪到会话文件名下 */
export function rekey(from: string, to: string): void {
  const s = load()
  if (from === to || !s.sessions[from]) return
  s.sessions[to] = s.sessions[from]
  delete s.sessions[from]
  save()
}

/** 从一个对话分叉出新对话时，新对话沿用原来的开关 */
export function copySession(from: string, to: string): void {
  const s = load()
  if (from === to || !s.sessions[from]) return
  s.sessions[to] = { ...s.sessions[from] }
  save()
}

/** 对话被删掉时，它的专属设置也一起删 */
export function forget(key: string): void {
  const s = load()
  if (!s.sessions[key]) return
  delete s.sessions[key]
  save()
}

/** 启动和退出时清掉临时生成的 MCP 配置副本（里面带着密钥，不该一直留在磁盘上） */
export function cleanRunDir(): void {
  fs.rmSync(RUN_DIR, { recursive: true, force: true })
}

export interface Launch {
  args: string[]
  /** 参数变了说明能力设置变了，需要重启进程才生效 */
  signature: string
}

/** 把当前的能力设置翻译成 Pi 的启动参数 */
export async function launchArgs(key: string, cwd: string): Promise<Launch> {
  const items = await getItems(key, cwd)
  const args: string[] = []

  const skills = items.filter((item) => item.id.startsWith('skill:'))
  // 平时由这里说了算：关掉 Pi 自己的发现，把开着的技能一个个交给它。
  // 但问不出 Pi 默认会加载哪些技能时，手里的清单是不全的，就让 Pi 照常自己找，这里只补上额外打开的
  if (!skillsUnknown(cwd)) args.push('--no-skills')
  for (const skill of skills) {
    if (skill.state !== 'off' && skill.path) args.push('--skill', skill.path)
  }
  const pinned = skills.filter((skill) => skill.state === 'on' && skill.path)
  if (pinned.length) {
    args.push(
      '--append-system-prompt',
      [
        'The user pinned the following skills for this conversation. Before working on a request, read each pinned SKILL.md and follow it.',
        ...pinned.map((skill) => `- ${skill.name}: ${skill.path}`)
      ].join('\n')
    )
  }

  const bundled = items.filter((item) => item.id.startsWith(DESKTOP_EXT_PREFIX))
  const extensions = items.filter((item) => item.id.startsWith('ext:') && !item.id.startsWith(DESKTOP_EXT_PREFIX))
  for (const ext of bundled) if (ext.state !== 'off' && ext.path) args.push('-e', ext.path)
  const adapter = extensions.find((ext) => ext.id.includes('mcp-adapter'))
  // 装着适配器、但设置里选了 Pi 自带的接法：这时不能让 Pi 自己去加载全部扩展（那样适配器会顶替自带的 MCP），
  // 要由这里一个个点名，把适配器漏掉
  const useBuiltinMcp = !adapter || adapter.locked === true
  if ((adapter && useBuiltinMcp) || extensions.some((ext) => ext.state !== ext.defaultState)) {
    args.push('--no-extensions')
    // Pi 1.0 起，--no-extensions 会连内置扩展一起关掉，这里把它们加回来。
    for (const builtin of BUILTIN_EXTENSIONS) args.push('-e', `builtin:${builtin}`)
    // 自带的 MCP：用适配器时由适配器负责（适配器关了就等于这次不用 MCP），不用适配器时要加回来，不然 MCP 就整个没了
    if (useBuiltinMcp) args.push('-e', 'builtin:mcp')
    for (const ext of extensions) {
      if (ext.state === 'off') continue
      for (const file of ext.paths ?? (ext.path ? [ext.path] : [])) args.push('-e', file)
    }
  }

  const disabledTools = items.filter((item) => item.id.startsWith('tool:') && item.state === 'off').map((item) => item.id.slice(5))
  if (disabledTools.length) args.push('--exclude-tools', disabledTools.join(','))

  const servers = items.filter((item) => item.id.startsWith('mcp:'))
  const adapterOn = Boolean(adapter && !useBuiltinMcp && adapter.state !== 'off')
  if (adapterOn && servers.some((server) => server.state !== server.defaultState)) {
    const config = readJson<{ mcpServers?: Record<string, Record<string, unknown>> }>(MCP_CONFIG, {})
    for (const server of servers) {
      const entry = config.mcpServers?.[server.id.slice(4)]
      if (!entry) continue
      // 两种写法都有人认，一起写，免得原来写着 enabled:false 的服务打开后还是关着
      entry.disabled = server.state === 'off'
      entry.enabled = server.state !== 'off'
    }
    // 这份副本带着原配置里的密钥，只给当前用户读
    fs.mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 })
    const body = JSON.stringify(config, null, 2)
    const file = path.join(RUN_DIR, `mcp-${crypto.createHash('sha1').update(body).digest('hex').slice(0, 12)}.json`)
    fs.writeFileSync(file, body, { mode: 0o600 })
    args.push('--mcp-config', file)
  }

  return { args, signature: crypto.createHash('sha1').update(JSON.stringify(args)).digest('hex') }
}
