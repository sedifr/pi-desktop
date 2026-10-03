import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CapItem, DesktopConfig, PackageInfo, Theme, UpdateInfo } from '@shared/types'
import { Accounts } from './Accounts'
import { Commands, Shortcuts } from './Commands'
import { Mcp } from './Mcp'
import { Tile, nextState } from './CapPanel'
import { installing } from './installing'
import { Market } from './Market'
import { Personalize } from './Personalize'
import { type ChatWidth, type SettingsTab, setAutoTitle, api, commandsChanged, errorText, getState, setPrefs, setSettingsTab, setView, toast, useApp } from './store'
import { Icon } from './ui'
import { t } from '@shared/i18n'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'look', label: t('外观') },
  { id: 'custom', label: t('个性化') },
  { id: 'caps', label: t('技能与工具') },
  { id: 'market', label: t('插件市场') },
  { id: 'sources', label: t('安装技能') },
  { id: 'commands', label: t('快捷指令') },
  { id: 'mcp', label: 'MCP' },
  { id: 'accounts', label: t('模型') },
  { id: 'keys', label: t('快捷键') },
  { id: 'about', label: t('关于') }
]

const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: t('跟随系统') },
  { id: 'light', label: t('浅色') },
  { id: 'dark', label: t('深色') }
]

const WIDTHS: { id: ChatWidth; label: string }[] = [
  { id: 'normal', label: t('标准') },
  { id: 'wide', label: t('宽') },
  { id: 'full', label: t('铺满') }
]

const LANGUAGES: { id: 'system' | 'zh' | 'en'; label: string }[] = [
  { id: 'system', label: t('跟随系统') },
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' }
]

function Look() {
  const prefs = useApp((s) => s.prefs)
  const autoTitle = useApp((s) => s.config?.autoTitle) ?? 'off'
  const models = useApp((s) => s.models)
  const favorites = useApp((s) => s.config?.favoriteModels)
  // 起标题可以固定用一个便宜的模型：常用的排前面，再加上用过的；现在选着的那个一定在列表里
  const titleModels = [...new Set([...(favorites ?? []), ...Object.keys(models), ...(autoTitle !== 'off' && autoTitle !== 'same' ? [autoTitle] : [])])]
  return (
    <>
      <div className="set-row">
        <div className="set-label">{t('语言')}</div>
        <div className="segmented">
          {LANGUAGES.map((language) => (
            <button key={language.id} className={prefs.language === language.id ? 'on' : ''} onClick={() => setPrefs({ language: language.id })}>
              {language.label}
            </button>
          ))}
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">{t('主题')}</div>
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
          {t('对话字号')}
          <div className="muted small">{t('只影响对话正文，不影响侧栏和菜单')}</div>
        </div>
        <div className="set-control">
          <input type="range" min={12} max={18} step={1} value={prefs.fontSize} onChange={(event) => setPrefs({ fontSize: Number(event.target.value) })} />
          <span className="set-value">{prefs.fontSize}</span>
        </div>
      </div>
      <div className="set-preview" style={{ fontSize: prefs.fontSize }}>
        {t('这是对话正文的预览。The quick brown fox jumps over the lazy dog.')}
      </div>
      <div className="set-row">
        <div className="set-label">
          {t('对话区宽度')}
          <div className="muted small">{t('对话正文和输入框最宽占多少。窗口本身不够宽时，哪一档都会铺满')}</div>
        </div>
        <div className="segmented">
          {WIDTHS.map((width) => (
            <button key={width.id} className={prefs.chatWidth === width.id ? 'on' : ''} onClick={() => setPrefs({ chatWidth: width.id })}>
              {width.label}
            </button>
          ))}
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">
          {t('自动起标题')}
          <div className="muted small">{t('新对话聊完第一轮后，让模型概括成一个短标题（每次花一两百个 token）。关着时标题就是你的第一句话')}</div>
        </div>
        <div className="set-control">
          <select className="field" value={autoTitle} onChange={(event) => void setAutoTitle(event.target.value)}>
            <option value="off">{t('关')}</option>
            <option value="same">{t('用对话自己的模型')}</option>
            {titleModels.map((id) => (
              <option key={id} value={id}>
                {t('固定用 {model}', { model: id })}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">
          {t('做完时通知')}
          <div className="muted small">{t('窗口不在前台时，回答做完或 Pi 在等你回答，用系统通知提醒。点通知回到那个对话')}</div>
        </div>
        <div className="segmented">
          <button className={prefs.notify ? 'on' : ''} onClick={() => setPrefs({ notify: true })}>
            {t('开')}
          </button>
          <button className={prefs.notify ? '' : 'on'} onClick={() => setPrefs({ notify: false })}>
            {t('关')}
          </button>
        </div>
      </div>
    </>
  )
}

const PACKAGE_KIND: Record<PackageInfo['kind'], string> = { npm: 'npm', git: 'git', local: t('本机文件夹') }

/** 装上的 Pi 包：别人打包好的技能、扩展和指令。相当于界面版的 pi install / pi remove */
function Packages({ onChanged }: { onChanged: () => void }) {
  const [list, setList] = useState<PackageInfo[]>()
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(installing.label)
  const [lines, setLines] = useState(installing.lines)
  const reload = useCallback(() => {
    api.packagesList().then(setList, () => setList([]))
  }, [])
  useEffect(reload, [reload])
  // 安装要一阵子，中途切到别的设置页再回来，进度和结果都要接得上
  useEffect(() => {
    const sync = () => {
      setBusy(installing.label)
      setLines(installing.lines)
      if (!installing.label) reload()
    }
    installing.listeners.add(sync)
    return () => void installing.listeners.delete(sync)
  }, [reload])

  const run = async (label: string, work: () => Promise<void>, done: string) => {
    installing.set(label, [])
    try {
      await work()
      toast(done)
      setSource('')
    } catch (error) {
      toast(errorText(error).slice(-400), 'error')
    }
    installing.set(undefined, [])
    // 包带来的技能和指令变了，开着的对话下次用到时要重新读清单
    commandsChanged()
    onChanged()
  }
  const install = () => {
    const target = source.trim()
    if (target) void run(t('正在安装 {source}…', { source: target }), () => api.packageInstall(target), t('已安装。新的技能和工具从下一条消息起可用'))
  }
  const remove = (item: PackageInfo) => {
    if (!window.confirm(t('移除「{source}」？它带来的技能、扩展和指令都会一起拿掉。', { source: item.source }))) return
    void run(t('正在移除 {source}…', { source: item.source }), () => api.packageRemove(item.source), t('已移除'))
  }

  return (
    <>
      <div className="cap-section">{t('安装技能和扩展')}</div>
      <div className="muted small">
        {t('Pi 的技能、扩展和指令可以打成一个包来分享。在这里填包的来源就能装上，和命令行里的 pi install 是一回事。')}
        <br />
        {t('包里的扩展能在你的电脑上运行代码，只装你信得过的来源。')}
      </div>
      <div className="install-row">
        <input
          className="field mono"
          value={source}
          disabled={Boolean(busy)}
          placeholder="npm:@scope/name　·　git:github.com/user/repo　·　/path/to/folder"
          onChange={(event) => setSource(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) install()
          }}
        />
        <button className="btn" disabled={Boolean(busy)} title={t('选一个本机文件夹')} onClick={() => void api.pickFolder().then((dir) => dir && setSource(dir))}>
          <Icon name="folder" size={13} />
        </button>
        <button className="btn primary" disabled={Boolean(busy) || !source.trim()} onClick={install}>
          {t('安装')}
        </button>
      </div>
      {busy && (
        <div className="install-log">
          <div>
            <span className="dot-running" /> {busy}
          </div>
          {lines.map((line, index) => (
            <div key={index} className="muted ellipsis">
              {line}
            </div>
          ))}
        </div>
      )}
      {list?.map((item) => (
        <div key={item.source} className="set-row">
          <div className="set-label grow">
            <span className="mono ellipsis">{item.source}</span>
            <div className="muted small">
              {PACKAGE_KIND[item.kind]}
              {item.filtered && ` · ${t('只加载了其中一部分')}`}
            </div>
          </div>
          <button className="btn" disabled={Boolean(busy)} onClick={() => remove(item)}>
            {t('移除')}
          </button>
        </div>
      ))}
      {list && !list.length && <div className="cap-empty">{t('还没有装任何包')}</div>}
      <div className="set-gap" />
    </>
  )
}

/** 让模型给还没有简介的项各写一句。会花一点额度，所以要点了才做 */
function SummaryHelper({ version, onChanged }: { version: number; onChanged: () => void }) {
  const [missing, setMissing] = useState(0)
  const [progress, setProgress] = useState<string>()
  useEffect(() => {
    api.summariesMissing().then(setMissing, () => setMissing(0))
  }, [version])
  useEffect(() => api.onSummaryProgress((done, total) => setProgress(`${done}/${total}`)), [])
  if (!missing) return null

  const generate = async () => {
    const { activeKey, convs, defaults } = getState()
    const current = activeKey ? convs[activeKey]?.info.model : undefined
    const model = current ? `${current.provider}/${current.id}` : defaults?.defaultProvider && defaults.defaultModel ? `${defaults.defaultProvider}/${defaults.defaultModel}` : undefined
    if (!model) return toast(t('先在「模型」里连接一个模型'), 'warning')
    if (!window.confirm(t('让 {model} 给 {n} 项各写一句简介？会花一点模型额度。写完以后每一句都还能自己改。', { model, n: missing }))) return
    setProgress(`0/${missing}`)
    try {
      const written = await api.summariesGenerate(model)
      toast(t('写好了 {n} 句简介', { n: written }))
    } catch (error) {
      toast(errorText(error).slice(-300), 'error')
    }
    setProgress(undefined)
    onChanged()
  }

  return (
    <div className="trust-banner">
      <Icon name="spark" size={15} />
      <div className="grow">{t('有 {n} 项还没有自己的简介，现在显示的是它们自带说明的第一句。', { n: missing })}</div>
      <button className="btn" disabled={Boolean(progress)} onClick={() => void generate()}>
        {progress ? t('正在写… {progress}', { progress }) : t('让模型各写一句')}
      </button>
    </div>
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
    commandsChanged()
    onChanged()
  }
  return (
    <>
      <div className="cap-section">
        {t('额外的技能文件夹')}
        <span className="grow" />
        <button className="btn" onClick={() => void api.skillDirAdd().then(apply)}>
          <Icon name="plus" size={13} /> {t('添加文件夹')}
        </button>
      </div>
      <div className="muted small">
        {t('这些文件夹里的技能默认不启用，但会出现在技能列表里，可以在对话中按需打开。适合放平时不想让 Pi 自动加载、偶尔才用的技能。')}
      </div>
      {dirs.map((dir) => (
        <div key={dir} className="set-row">
          <div className="set-label grow">{dir}</div>
          <button className="btn" onClick={() => void api.skillDirRemove(dir).then(apply)}>
            {t('移除')}
          </button>
        </div>
      ))}
      {!dirs.length && <div className="cap-empty">{t('还没有添加')}</div>}
      <div className="set-row">
        <div className="set-label grow">
          {t('只在桌面端加载的扩展')}
          <div className="muted small">{t('把 Pi 扩展放进这个文件夹，它们只在桌面端生效，命令行不受影响。放进去后会出现在「工具」里。')}</div>
        </div>
        <button className="btn" onClick={() => api.openPath('extensions')}>
          {t('打开文件夹')}
        </button>
      </div>
    </>
  )
}

function Caps() {
  const [items, setItems] = useState<CapItem[]>()
  const [query, setQuery] = useState('')
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => {
    api.capsGlobalGet().then(setItems, () => toast(t('读取技能列表失败'), 'error'))
    setVersion((current) => current + 1)
  }, [])
  useEffect(reload, [reload])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? (items ?? []).filter((item) => `${item.name} ${item.summary} ${item.description ?? ''}`.toLowerCase().includes(q)) : (items ?? [])
  }, [items, query])

  const toggle = (item: CapItem) => {
    const state = nextState(item)
    setItems((current) => current?.map((it) => (it.id === item.id ? { ...it, state } : it)))
    api.capsGlobalSet({ [item.id]: state }).then(setItems, () => toast(t('保存失败'), 'error'))
  }

  const edit = (item: CapItem, summary: string) => void api.summarySet(item.id, summary).then(reload, () => toast(t('保存失败'), 'error'))

  const section = (title: string, list: CapItem[], columns = '') =>
    list.length > 0 && (
      <>
        <div className="cap-section">
          {title}
          <span className="muted small">{t('{on} 个开着，共 {total} 个', { on: list.filter((item) => item.state !== 'off').length, total: list.length })}</span>
        </div>
        <div className={`cap-grid ${columns}`}>
          {list.map((item) => (
            <Tile key={item.id} item={item} onToggle={() => toggle(item)} onEdit={(summary) => edit(item, summary)} />
          ))}
        </div>
      </>
    )

  return (
    <>
      <div className="set-note">
        {t('这里设的是全局默认：所有项目里新开的对话，一开始就是这个状态。单个项目或单次对话想不一样，在对话输入栏的面板里改。')}
        <br />
        {t('技能有三档：自动（AI 自己判断要不要用）、开（一定带上）、关（AI 看不到）。')}
        <br />
        {t('每一项下面那句简介可以改：鼠标移上去点那支笔，写成你自己记得住的话。')}
      </div>
      <label className="cap-search wide">
        <Icon name="search" size={13} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('搜名字或用途')} />
      </label>
      <SummaryHelper version={version} onChanged={reload} />
      {!items ? (
        <div className="cap-empty">{t('正在读取…')}</div>
      ) : (
        <>
          {section(
            t('技能'),
            filtered.filter((item) => item.kind === 'skill'),
            'three'
          )}
          {section(
            'MCP',
            filtered.filter((item) => item.kind === 'mcp'),
            'three'
          )}
          {section(
            t('工具'),
            filtered.filter((item) => item.kind === 'tool'),
            'three'
          )}
          {!filtered.length && <div className="cap-empty">{t('没有匹配的项')}</div>}
        </>
      )}
      <div className="set-row">
        <div className="set-label grow">
          {t('想要更多技能和工具？')}
          <div className="muted small">{t('装别人打包好的技能和扩展，或者把自己的技能文件夹加进来')}</div>
        </div>
        <button className="btn" onClick={() => setSettingsTab('sources')}>
          {t('去「安装技能」')}
        </button>
      </div>
    </>
  )
}

function About() {
  const defaults = useApp((s) => s.defaults)
  const [update, setUpdate] = useState<UpdateInfo | 'checking'>()
  const check = () => {
    setUpdate('checking')
    api.updateCheck().then(setUpdate, (error) => {
      setUpdate(undefined)
      toast(errorText(error), 'error')
    })
  }
  return (
    <>
      <div className="set-row">
        <div className="set-label">
          {t('桌面端版本')}
          {update && update !== 'checking' && (
            <div className="muted small">
              {update.newer
                ? t('有新版本 {version}。应用没有 Apple 的开发者签名，不能自己更新，要去下载页装一下', { version: update.latest ?? '' })
                : update.latest
                  ? t('已经是最新的了')
                  : t('还没有发布过版本，查不到更新')}
            </div>
          )}
        </div>
        <div className="set-control">
          <span className="muted">{defaults?.appVersion}</span>
          {update && update !== 'checking' && update.newer && update.url ? (
            <button className="btn primary" onClick={() => api.openExternal(update.url!)}>
              {t('去下载')}
            </button>
          ) : (
            <button className="btn" disabled={update === 'checking'} onClick={check}>
              {update === 'checking' ? t('正在检查…') : t('检查更新')}
            </button>
          )}
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">{t('Pi 内核版本')}</div>
        <span className="muted">{defaults?.piVersion}</span>
      </div>
      <div className="set-row">
        <div className="set-label">
          {t('Pi 数据目录')}
          <div className="muted small">{defaults?.agentDir}</div>
        </div>
        <button className="btn" onClick={() => api.openPath('agent')}>
          {t('在访达中打开')}
        </button>
      </div>
      <div className="set-row">
        <div className="set-label">
          {t('简介文件')}
          <div className="muted small">{t('技能、MCP、工具在界面上显示的那句简介存在这里，可以直接改')}</div>
        </div>
        <button className="btn" onClick={() => api.openPath('summaries')}>
          {t('在访达中显示')}
        </button>
      </div>
    </>
  )
}

export function Settings() {
  const tab = useApp((s) => s.settingsTab)
  // Esc 关设置；正在填表或有弹窗开着时不抢这个键
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      if ((event.target as HTMLElement).closest?.('input, textarea, select') || document.querySelector('.overlay, .custom-form')) return
      setView('chat')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="settings">
      <header className="header">
        <span className="header-title">{t('设置')}</span>
        <span className="grow" />
        <button className="chip" onClick={() => setView('chat')}>
          <Icon name="x" size={14} />
          {t('关闭')}
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
          <div className={`settings-column ${tab === 'caps' || tab === 'market' ? 'wide' : ''}`}>
            {tab === 'look' && <Look />}
            {tab === 'caps' && <Caps />}
            {tab === 'custom' && <Personalize />}
            {tab === 'market' && <Market />}
            {tab === 'sources' && (
              <>
                <Packages onChanged={() => {}} />
                <Sources onChanged={() => {}} />
              </>
            )}
            {tab === 'commands' && <Commands />}
            {tab === 'mcp' && <Mcp />}
            {tab === 'accounts' && <Accounts />}
            {tab === 'keys' && <Shortcuts />}
            {tab === 'about' && <About />}
          </div>
        </div>
      </div>
    </div>
  )
}
