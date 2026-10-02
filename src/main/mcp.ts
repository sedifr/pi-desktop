import fs from 'node:fs'
import { t } from '@shared/i18n'
import type { McpServerInfo, McpServerInput } from '@shared/types'
import { MCP_CONFIG } from './catalog'
import { readJsonForEdit, writeJson } from './env'

type Entry = Record<string, unknown>
interface McpFile {
  mcpServers?: Record<string, Entry>
  [key: string]: unknown
}

const keysOf = (value: unknown): string[] => (value && typeof value === 'object' ? Object.keys(value) : [])

/** 用户级的 MCP 服务（Pi 配置目录下的 mcp.json）。环境变量和请求头只给出名字，值不送到界面上 */
export function listMcp(): McpServerInfo[] {
  // 读不懂时要报出来，不能显示成「还没有服务」
  const config = readJsonForEdit<McpFile>(MCP_CONFIG)
  return Object.entries(config.mcpServers ?? {}).map(([name, entry]) => ({
    name,
    kind: typeof entry.url === 'string' ? 'http' : 'stdio',
    command: typeof entry.command === 'string' ? entry.command : undefined,
    args: Array.isArray(entry.args) ? entry.args.map(String) : [],
    url: typeof entry.url === 'string' ? entry.url : undefined,
    description: typeof entry.description === 'string' ? entry.description : '',
    envKeys: keysOf(entry.env),
    headerKeys: keysOf(entry.headers),
    enabled: entry.enabled !== false && entry.disabled !== true
  }))
}

function write(config: McpFile): void {
  // 第一次动这个文件前留一份原样的备份
  const backup = `${MCP_CONFIG}.bak-desktop`
  if (fs.existsSync(MCP_CONFIG) && !fs.existsSync(backup)) fs.copyFileSync(MCP_CONFIG, backup)
  // 这个文件里可能有密钥，新建时只给当前用户读
  writeJson(MCP_CONFIG, config, 0o600)
}

export function saveMcp(input: McpServerInput): void {
  const name = input.name.trim()
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(t('名字只能用字母、数字、下划线和短横线'))
  const config = readJsonForEdit<McpFile>(MCP_CONFIG)
  const servers = { ...(config.mcpServers ?? {}) }
  if (name !== input.originalName && servers[name]) throw new Error(t('已经有一个叫 {name} 的服务了', { name }))

  // 在原来的条目上改，界面没管的字段（超时、工具暴露方式等）原样留着
  const entry: Entry = { ...(input.originalName ? servers[input.originalName] : {}) }
  if (input.kind === 'http') {
    const url = input.url?.trim() ?? ''
    if (!/^https?:\/\//.test(url)) throw new Error(t('网址要以 http:// 或 https:// 开头'))
    entry.url = url
    delete entry.command
    delete entry.args
    delete entry.env
    if (input.secrets) entry.headers = input.secrets
  } else {
    const command = input.command?.trim() ?? ''
    if (!command) throw new Error(t('要填启动命令'))
    entry.command = command
    entry.args = input.args ?? []
    delete entry.url
    delete entry.headers
    if (input.secrets) entry.env = input.secrets
  }
  for (const key of ['env', 'headers']) if (entry[key] && !keysOf(entry[key]).length) delete entry[key]
  if (input.description.trim()) entry.description = input.description.trim()
  else delete entry.description

  if (input.originalName && input.originalName !== name) {
    // 改名时留在原来的位置上
    const renamed: Record<string, Entry> = {}
    for (const [key, value] of Object.entries(servers)) renamed[key === input.originalName ? name : key] = key === input.originalName ? entry : value
    write({ ...config, mcpServers: renamed })
  } else {
    servers[name] = entry
    write({ ...config, mcpServers: servers })
  }
}

export function removeMcp(name: string): void {
  const config = readJsonForEdit<McpFile>(MCP_CONFIG)
  if (!config.mcpServers?.[name]) return
  const servers = { ...config.mcpServers }
  delete servers[name]
  write({ ...config, mcpServers: servers })
}
