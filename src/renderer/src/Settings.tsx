import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CapItem, DesktopConfig, Theme } from '@shared/types'
import { Accounts } from './Accounts'
import { Tile, nextState } from './CapPanel'
import { type SettingsTab, api, setPrefs, setSettingsTab, setView, toast, useApp } from './store'
import { Icon } from './ui'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'look', label: '外观' },
  { id: 'caps', label: '技能与工具' },
  { id: 'accounts', label: '模型' },
  { id: 'about', label: '关于' }
]

const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' }
]

function Look() {
  const prefs = useApp((s) => s.prefs)
  return (
    <>
      <div className="set-row">
        <div className="set-label">主题</div>
        <div className="segmented">
          {THEMES.map((theme) => (
            <button key={theme.id} className={prefs.theme === theme.id ? 'on' : ''} onClick={() => setPrefs({ theme: theme.id })}>
              {theme.label}
            </button>
          ))}
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">
          对话字号
          <div className="muted small">只影响对话正文，不影响侧栏和菜单</div>
        </div>
        <div className="set-control">
          <input type="range" min={12} max={18} step={1} value={prefs.fontSize} onChange={(event) => setPrefs({ fontSize: Number(event.target.value) })} />
          <span className="set-value">{prefs.fontSize}</span>
        </div>
      </div>
      <div className="set-preview" style={{ fontSize: prefs.fontSize }}>
        这是对话正文的预览。The quick brown fox jumps over the lazy dog.
      </div>
    </>
  )
}

/** 额外的技能文件夹，和只在桌面端加载的扩展。两样默认都是空的 */
function Sources({ onChanged }: { onChanged: () => void }) {
  const [dirs, setDirs] = useState<string[]>([])
  useEffect(() => {
    void api.configGet().then((config) => setDirs(config.extraSkillDirs))
  }, [])
  const apply = (config: DesktopConfig) => {
    setDirs(config.extraSkillDirs)
    onChanged()
  }
  return (
    <>
      <div className="cap-section">
        额外的技能文件夹
        <span className="grow" />
        <button className="btn" onClick={() => void api.skillDirAdd().then(apply)}>
          <Icon name="plus" size={13} /> 添加文件夹
        </button>
      </div>
      <div className="muted small">
        这些文件夹里的技能默认不启用，但会出现在技能列表里，可以在对话中按需打开。适合放平时不想让 Pi 自动加载、偶尔才用的技能。
      </div>
      {dirs.map((dir) => (
        <div key={dir} className="set-row">
          <div className="set-label grow">{dir}</div>
          <button className="btn" onClick={() => void api.skillDirRemove(dir).then(apply)}>
            移除
          </button>
        </div>
      ))}
      {!dirs.length && <div className="cap-empty">还没有添加</div>}
      <div className="set-row">
        <div className="set-label grow">
          只在桌面端加载的扩展
          <div className="muted small">把 Pi 扩展放进这个文件夹，它们只在桌面端生效，命令行不受影响。放进去后会出现在「工具」里。</div>
        </div>
        <button className="btn" onClick={() => api.openPath('extensions')}>
          打开文件夹
        </button>
      </div>
    </>
  )
}

function Caps() {
  const [items, setItems] = useState<CapItem[]>()
  const [query, setQuery] = useState('')
  const reload = useCallback(() => {
    api.capsGlobalGet().then(setItems, () => toast('读取技能列表失败', 'error'))
  }, [])
  useEffect(reload, [reload])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? (items ?? []).filter((item) => `${item.name} ${item.summary} ${item.description ?? ''}`.toLowerCase().includes(q)) : (items ?? [])
  }, [items, query])

  const toggle = (item: CapItem) => {
    const state = nextState(item)
    setItems((current) => current?.map((it) => (it.id === item.id ? { ...it, state } : it)))
    api.capsGlobalSet({ [item.id]: state }).then(setItems, () => toast('保存失败', 'error'))
  }

  const section = (title: string, list: CapItem[], columns = '') =>
    list.length > 0 && (
      <>
        <div className="cap-section">
          {title}
          <span className="muted small">{list.filter((item) => item.state !== 'off').length} 个开着，共 {list.length} 个</span>
        </div>
        <div className={`cap-grid ${columns}`}>
          {list.map((item) => (
            <Tile key={item.id} item={item} onToggle={() => toggle(item)} />
          ))}
        </div>
      </>
    )

  return (
    <>
      <div className="set-note">
        这里设的是全局默认：所有项目里新开的对话，一开始就是这个状态。单个项目或单次对话想不一样，在对话输入栏的面板里改。
        <br />
        技能有三档：自动（AI 自己判断要不要用）、开（一定带上）、关（AI 看不到）。
      </div>
      <label className="cap-search wide">
        <Icon name="search" size={13} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜名字或用途" />
      </label>
      {!items ? (
        <div className="cap-empty">正在读取…</div>
      ) : (
        <>
          {section(
            '技能',
            filtered.filter((item) => item.kind === 'skill'),
            'three'
          )}
          {section(
            'MCP',
            filtered.filter((item) => item.kind === 'mcp'),
            'three'
          )}
          {section(
            '工具',
            filtered.filter((item) => item.kind === 'tool'),
            'three'
          )}
          {!filtered.length && <div className="cap-empty">没有匹配的项</div>}
        </>
      )}
      <div className="set-gap" />
      <Sources onChanged={reload} />
    </>
  )
}

function About() {
  const defaults = useApp((s) => s.defaults)
  return (
    <>
      <div className="set-row">
        <div className="set-label">桌面端版本</div>
        <span className="muted">{defaults?.appVersion}</span>
      </div>
      <div className="set-row">
        <div className="set-label">Pi 内核版本</div>
        <span className="muted">{defaults?.piVersion}</span>
      </div>
      <div className="set-row">
        <div className="set-label">
          Pi 数据目录
          <div className="muted small">{defaults?.agentDir}</div>
        </div>
        <button className="btn" onClick={() => api.openPath('agent')}>
          在访达中打开
        </button>
      </div>
      <div className="set-row">
        <div className="set-label">
          技能简介文件
          <div className="muted small">每个技能那一句中文说明存在这里，可以直接改</div>
        </div>
        <button className="btn" onClick={() => api.openPath('summaries')}>
          在访达中显示
        </button>
      </div>
    </>
  )
}

export function Settings() {
  const tab = useApp((s) => s.settingsTab)
  return (
    <div className="settings">
      <header className="header">
        <span className="header-title">设置</span>
        <span className="grow" />
        <button className="chip" onClick={() => setView('chat')}>
          <Icon name="x" size={14} />
          关闭
        </button>
      </header>
      <div className="settings-body">
        <nav className="settings-nav">
          {TABS.map((item) => (
            <button key={item.id} className={`nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => setSettingsTab(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          <div className={`settings-column ${tab === 'caps' ? 'wide' : ''}`}>
            {tab === 'look' && <Look />}
            {tab === 'caps' && <Caps />}
            {tab === 'accounts' && <Accounts />}
            {tab === 'about' && <About />}
          </div>
        </div>
      </div>
    </div>
  )
}
