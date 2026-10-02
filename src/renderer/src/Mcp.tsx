import { useCallback, useEffect, useState } from 'react'
import { t } from '@shared/i18n'
import type { McpServerInfo } from '@shared/types'
import { api, errorText, getState, loadCaps, toast } from './store'
import { Icon } from './ui'

/** 把一行命令拆成程序和参数：按空格分，引号里的空格不分 */
export function splitCommand(line: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote = ''
  let started = false
  for (const char of line.trim()) {
    if (quote) {
      if (char === quote) quote = ''
      else current += char
    } else if (char === '"' || char === "'") {
      quote = char
      started = true
    } else if (/\s/.test(char)) {
      if (current || started) parts.push(current)
      current = ''
      started = false
    } else current += char
  }
  if (current || started) parts.push(current)
  return parts
}

const joinCommand = (parts: string[]): string => parts.map((part) => (/[\s"']/.test(part) || !part ? JSON.stringify(part) : part)).join(' ')

/** 每行一个「名字=值」 */
function parsePairs(text: string): Record<string, string> | undefined {
  const pairs: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const index = line.indexOf('=')
    if (index > 0) pairs[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return Object.keys(pairs).length ? pairs : undefined
}

interface Draft {
  name: string
  originalName?: string
  kind: 'stdio' | 'http'
  line: string
  url: string
  description: string
  secrets: string
  /** 已经存着的环境变量或请求头的名字 */
  existing: string[]
}

const BLANK: Draft = { name: '', kind: 'stdio', line: '', url: '', description: '', secrets: '', existing: [] }

function Editor({ draft, onDone, onCancel }: { draft: Draft; onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState(draft)
  const [error, setError] = useState<string>()
  const set = (patch: Partial<Draft>) => setForm({ ...form, ...patch })
  const stdio = form.kind === 'stdio'
  const save = async () => {
    const [command, ...args] = splitCommand(form.line)
    try {
      await api.mcpSave({
        name: form.name,
        originalName: form.originalName,
        kind: form.kind,
        command,
        args,
        url: form.url,
        description: form.description,
        secrets: parsePairs(form.secrets)
      })
      onDone()
    } catch (e) {
      setError(errorText(e))
    }
  }
  return (
    <div className="custom-form">
      <div className="pop-title">{form.originalName ? t('修改 MCP 服务') : t('添加 MCP 服务')}</div>
      <label>
        {t('名字')}
        <input className="field" autoFocus={!form.originalName} value={form.name} placeholder="filesystem" onChange={(event) => set({ name: event.target.value })} />
      </label>
      <label>
        {t('怎么连接')}
        <div className="segmented">
          <button className={stdio ? 'on' : ''} onClick={() => set({ kind: 'stdio' })}>
            {t('在本机启动一个程序')}
          </button>
          <button className={stdio ? '' : 'on'} onClick={() => set({ kind: 'http' })}>
            {t('连一个网址')}
          </button>
        </div>
      </label>
      {stdio ? (
        <label>
          {t('启动命令')}
          <input className="field mono" value={form.line} placeholder="npx -y @modelcontextprotocol/server-filesystem ." onChange={(event) => set({ line: event.target.value })} />
          <span className="muted small">{t('就是这个服务的说明里让你运行的那一行。')}</span>
        </label>
      ) : (
        <label>
          {t('网址')}
          <input className="field mono" value={form.url} placeholder="https://example.com/mcp" onChange={(event) => set({ url: event.target.value })} />
        </label>
      )}
      <label>
        {t('一句话说明（可选）')}
        <input className="field" value={form.description} placeholder={t('这个服务能做什么。Pi 也会看这句话来决定什么时候用它')} onChange={(event) => set({ description: event.target.value })} />
      </label>
      <label>
        {stdio ? t('环境变量（可选）') : t('请求头（可选）')}
        <textarea className="field mono" rows={3} value={form.secrets} placeholder={stdio ? 'API_KEY=...' : 'Authorization=Bearer ...'} onChange={(event) => set({ secrets: event.target.value })} />
        <span className="muted small">
          {t('每行一个，写成「名字=值」。')}
          {form.existing.length > 0 && t('已经存着：{keys}。留空就保持不变；要改的话把全部重新写一遍。', { keys: form.existing.join('、') })}
        </span>
      </label>
      {error && <div className="banner error">{error}</div>}
      <div className="dialog-actions">
        <button className="btn" onClick={onCancel}>
          {t('取消')}
        </button>
        <button className="btn primary" onClick={() => void save()}>
          {t('保存')}
        </button>
      </div>
    </div>
  )
}

/** 设置里的「MCP」页：增删改 Pi 配置目录下 mcp.json 里的服务 */
export function Mcp() {
  const [list, setList] = useState<McpServerInfo[]>()
  const [editing, setEditing] = useState<Draft>()

  const reload = useCallback(() => {
    api.mcpList().then(setList, (error) => toast(errorText(error), 'error'))
  }, [])
  useEffect(reload, [reload])

  const changed = () => {
    setEditing(undefined)
    reload()
    // 对话输入栏里的 MCP 列表也跟着更新
    const { activeKey } = getState()
    if (activeKey) void loadCaps(activeKey)
  }

  const remove = async (server: McpServerInfo) => {
    if (!window.confirm(t('删除 MCP 服务「{name}」？它的配置会从 mcp.json 里去掉。', { name: server.name }))) return
    try {
      await api.mcpRemove(server.name)
      changed()
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  const edit = (server: McpServerInfo) =>
    setEditing({
      name: server.name,
      originalName: server.name,
      kind: server.kind,
      line: joinCommand([server.command ?? '', ...server.args].filter((part, index) => index > 0 || part)),
      url: server.url ?? '',
      description: server.description,
      secrets: '',
      existing: server.kind === 'http' ? server.headerKeys : server.envKeys
    })

  return (
    <>
      <div className="set-note">
        {t('MCP 服务给 Pi 接上外部的工具和数据，比如浏览器、数据库、邮箱。这里管的是所有项目共用的那一份。')}
        <br />
        {t('每次对话用不用某个服务，在对话输入栏的「MCP」里开关。')}
      </div>
      <div className="cap-section">
        {t('已添加的服务')}
        <span className="grow" />
        <button className="btn" onClick={() => setEditing({ ...BLANK })}>
          <Icon name="plus" size={13} /> {t('添加服务')}
        </button>
      </div>
      {editing && <Editor key={editing.originalName ?? 'new'} draft={editing} onCancel={() => setEditing(undefined)} onDone={changed} />}
      {!list && <div className="cap-empty">{t('正在读取…')}</div>}
      {list && !list.length && !editing && <div className="cap-empty">{t('还没有 MCP 服务。点「添加服务」接上第一个。')}</div>}
      {list?.map((server) => {
        const secrets = server.kind === 'http' ? server.headerKeys : server.envKeys
        return (
          <div key={server.name} className="set-row">
            <div className="set-label grow">
              <span className="mono">{server.name}</span>
              {!server.enabled && <span className="muted">　{t('默认不连接')}</span>}
              <div className="muted small ellipsis">{server.kind === 'http' ? server.url : joinCommand([server.command ?? '', ...server.args])}</div>
              {(server.description || secrets.length > 0) && (
                <div className="muted small">
                  {[server.description, secrets.length > 0 && (server.kind === 'http' ? t('{n} 个请求头', { n: secrets.length }) : t('{n} 个环境变量', { n: secrets.length }))].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <div className="set-control">
              <button className="btn" onClick={() => edit(server)}>
                {t('修改')}
              </button>
              <button className="btn" onClick={() => void remove(server)}>
                {t('删除')}
              </button>
            </div>
          </div>
        )
      })}
      <div className="set-row">
        <div className="set-label grow">
          {t('配置文件')}
          <div className="muted small">{t('更细的选项（超时、工具暴露方式、OAuth 登录）直接改这个文件。第一次从这里改动前会自动留一份备份')}</div>
        </div>
        <button className="btn" onClick={() => api.openPath('mcp')}>
          {t('在访达中显示')}
        </button>
      </div>
    </>
  )
}
