import { useEffect, useMemo, useRef, useState } from 'react'
import type { UsageTotals } from '@shared/types'
import { ButtonEditor, Slot } from './Buttons'
import { Chat } from './Chat'
import { Composer } from './Composer'
import { Gallery, ImagePreview } from './Gallery'
import { Pane } from './Pane'
import { Settings } from './Settings'
import { FILE_DRAG } from './Files'
import { Rail } from './Rail'
import { SearchPalette } from './Search'
import { SESSION_DRAG, Sidebar } from './Sidebar'
import {
  addProject,
  answerUi,
  api,
  attachSession,
  type Conv,
  isSubagent,
  mentionFile,
  openSession,
  rename,
  runCommand,
  setAutoCompaction,
  setLightbox,
  setPrefs,
  setRenaming,
  setTrust,
  subagentLabel,
  type UiRequest,
  useApp
} from './store'
import { Icon, Popover, baseName, fmtCost, fmtTokens, relTime } from './ui'
import { t } from '@shared/i18n'
import { type UsageView, contextPercent, usageOf } from './usage'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function UsagePopover({ conv, usage, onClose }: { conv: Conv; usage: UsageView; onClose: () => void }) {
  const auto = useApp((s) => s.defaults?.autoCompaction ?? true)
  const [totals, setTotals] = useState<UsageTotals>()
  useEffect(() => {
    void api.usageTotals().then(setTotals)
  }, [])
  const read = usage.input + usage.cacheRead + usage.cacheWrite
  const hit = read > 0 ? (usage.cacheRead / read) * 100 : 0
  const percent = contextPercent(usage)
  return (
    <Popover onClose={onClose} className="usage-pop" group="header">
      <div className="pop-title">{t('本次对话用量')}</div>
      <Row label={t('费用')} value={fmtCost(usage.cost)} />
      <Row label={t('输入')} value={usage.input.toLocaleString()} />
      <Row label={t('输出')} value={usage.output.toLocaleString()} />
      <Row label={t('缓存读取')} value={usage.cacheRead.toLocaleString()} />
      <Row label={t('缓存命中率')} value={`${hit.toFixed(1)}%`} />
      {usage.toolCalls != null && <Row label={t('工具调用')} value={t('{n} 次', { n: usage.toolCalls })} />}
      <div className="kv gap">
        <span className="muted">{t('上下文')}</span>
        <span>
          {fmtTokens(usage.contextTokens)}
          {usage.contextWindow ? ` / ${fmtTokens(usage.contextWindow)}` : ''}
          {percent != null ? `（${percent.toFixed(1)}%）` : ''}
        </span>
      </div>
      {percent != null && (
        <div className={`meter ${percent >= 85 ? 'warn' : ''}`}>
          <div style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
      )}
      <div className="kv gap">
        <span className="muted" title={t('上下文快满时，Pi 自动把更早的内容压缩成摘要。这个开关对所有对话都生效')}>
          {t('快满时自动压缩')}
        </span>
        <div className="segmented small">
          <button className={auto ? 'on' : ''} onClick={() => void setAutoCompaction(conv.key, true)}>
            {t('开')}
          </button>
          <button className={auto ? '' : 'on'} onClick={() => void setAutoCompaction(conv.key, false)}>
            {t('关')}
          </button>
        </div>
      </div>
      <button
        className="btn wide"
        disabled={conv.streaming}
        onClick={() => {
          onClose()
          void runCommand(conv.key, 'compact', '')
        }}
      >
        {t('现在压缩')}
      </button>
      {totals && (
        <>
          <div className="pop-title gap">{t('全部对话合计')}</div>
          <Row label={t('今天')} value={fmtCost(totals.today.cost)} />
          <Row label={t('本月')} value={fmtCost(totals.month.cost)} />
          {totals.byModel.slice(0, 5).map((entry) => (
            <Row key={entry.model} label={`　${entry.model === '@other' ? t('其它') : entry.model === '@summaries' ? t('压缩与摘要') : entry.model}`} value={fmtCost(entry.usage.cost)} />
          ))}
        </>
      )}
    </Popover>
  )
}

/** 标题栏里直接改名：回车保存，Esc 或点到别处取消 */
function TitleEditor({ conv }: { conv: Conv }) {
  const [value, setValue] = useState(conv.title ?? '')
  return (
    <input
      autoFocus
      className="title-input no-drag"
      value={value}
      placeholder={t('给这个对话起个名字')}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => setRenaming(undefined)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Enter') {
          void rename(conv.key, value)
          setRenaming(undefined)
        } else if (event.key === 'Escape') setRenaming(undefined)
      }}
    />
  )
}

function Header({ conv }: { conv: Conv }) {
  const models = useApp((s) => s.models)
  const renaming = useApp((s) => s.renamingKey === conv.key)
  const collapsed = useApp((s) => s.prefs.sidebarCollapsed)
  const trust = useApp((s) => s.trust[conv.cwd])
  const paneOpen = useApp((s) => s.prefs.paneOpen)
  const sessions = useApp((s) => s.sessions)
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [agents, setAgents] = useState(false)
  const file = conv.sessionFile
  // 这个对话里 AI 开出来的子代理，和（如果它自己就是子代理）开它的那个对话
  const children = useMemo(() => (file ? sessions.filter((meta) => meta.parentSession === file && isSubagent(meta)).sort((a, b) => b.modified - a.modified) : []), [sessions, file])
  const self = useMemo(() => sessions.find((meta) => meta.file === file), [sessions, file])
  const parent = useMemo(() => (self && isSubagent(self) && self.parentSession ? sessions.find((meta) => meta.file === self.parentSession) : undefined), [sessions, self])
  const usage = usageOf(conv, (provider, id) => models[`${provider}/${id}`]?.contextWindow)
  const exact = contextPercent(usage)
  const percent = exact === undefined ? undefined : Math.round(exact)
  const run = (name: string) => {
    setMenu(false)
    void runCommand(conv.key, name, '')
  }
  return (
    <header className={`header ${collapsed ? 'no-sidebar' : ''}`}>
      {collapsed && (
        <button className="icon-btn" title={t('显示侧栏（⌘B）')} onClick={() => setPrefs({ sidebarCollapsed: false })}>
          <Icon name="sidebar" size={15} />
        </button>
      )}
      {renaming ? (
        <TitleEditor conv={conv} />
      ) : (
        <span className="header-title ellipsis no-drag" title={t('双击改名')} onDoubleClick={() => setRenaming(conv.key)}>
          {conv.title ?? t('新对话')}
        </span>
      )}
      <span className="muted small ellipsis header-project" title={conv.cwd}>
        {baseName(conv.cwd)}
      </span>
      <div className="anchor no-drag">
        <button className="icon-btn" data-popover-trigger="header-menu" title={t('更多操作')} onClick={() => setMenu(!menu)}>
          <Icon name="more" size={15} />
        </button>
        {menu && (
          <Popover onClose={() => setMenu(false)} className="menu below" group="header-menu">
            <button className="menu-item" onClick={() => run('name')}>
              {t('改名')}
            </button>
            <button className="menu-item" onClick={() => run('copy')}>
              {t('复制上一条回答')}
            </button>
            <button className="menu-item" onClick={() => run('compact')}>
              {t('压缩上下文')}
            </button>
            <button className="menu-item" onClick={() => run('export')}>
              {t('导出为网页')}
            </button>
            {trust?.needed && (
              <button
                className="menu-item"
                title={t('项目自带的技能、指令、扩展和 MCP 只在信任后加载')}
                onClick={() => {
                  setMenu(false)
                  void setTrust(conv.cwd, !trust.trusted)
                }}
              >
                {trust.trusted ? t('不再信任这个项目') : t('信任这个项目')}
              </button>
            )}
          </Popover>
        )}
      </div>
      {parent && (
        <button className="chip no-drag" title={t('这是子代理的对话。回到开它的那个对话')} onClick={() => void openSession(parent)}>
          <Icon name="left" size={12} />
          {t('主对话')}
        </button>
      )}
      {children.length > 0 && (
        <div className="anchor no-drag" data-part="head-agents">
          <button className="chip" data-popover-trigger="header-agents" title={t('这个对话里 AI 开出来的子代理')} onClick={() => setAgents(!agents)}>
            <Icon name="branch" size={13} />
            {t('子代理 {n}', { n: children.length })}
          </button>
          {agents && (
            <Popover onClose={() => setAgents(false)} className="menu below wide" group="header-agents">
              <div className="menu-label">{t('点开看它做了什么')}</div>
              {children.map((meta) => (
                <button
                  key={meta.file}
                  className="menu-item two-line"
                  onClick={() => {
                    setAgents(false)
                    void openSession(meta)
                  }}
                >
                  <span className="grow">
                    {subagentLabel(meta)}
                    <span className="menu-hint ellipsis">{(meta.firstUserText ?? '').split('\n')[0].slice(0, 80)}</span>
                  </span>
                  <span className="session-time">{relTime(meta.modified)}</span>
                </button>
              ))}
            </Popover>
          )}
        </div>
      )}
      <span className="grow" />
      <Slot name="header" />
      {!paneOpen && (
        <button className="icon-btn no-drag" data-part="head-pane" title={t('打开右侧面板：改动的文件、浏览器、终端（⌥⌘B）')} onClick={() => setPrefs({ paneOpen: true })}>
          <Icon name="panel" size={15} />
        </button>
      )}
      {usage && (
        <div className="anchor no-drag" data-part="head-usage">
          <button className={`chip ${percent != null && percent >= 85 ? 'warn' : ''}`} data-popover-trigger="header" onClick={() => setOpen(!open)}>
            <Icon name="chart" size={14} />
            {fmtCost(usage.cost)}
            {percent != null ? ` · ${percent}%` : ''}
          </button>
          {open && <UsagePopover conv={conv} usage={usage} onClose={() => setOpen(false)} />}
        </div>
      )}
    </header>
  )
}

function UiDialog({ conv, request }: { conv: Conv; request: UiRequest }) {
  const [value, setValue] = useState(request.prefill ?? '')
  const box = useRef<HTMLDivElement>(null)
  const cancel = () => answerUi(conv.key, { cancelled: true })
  // 弹窗出来时把键盘接过来：不然焦点还在输入框里，按 Esc 会把整轮回答停掉，按回车会把草稿发出去
  useEffect(() => {
    if (!box.current?.contains(document.activeElement)) box.current?.focus()
  }, [])
  return (
    <div className="overlay">
      <div
        className="dialog"
        ref={box}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Escape') {
            event.stopPropagation()
            cancel()
          } else if (event.key === 'Enter' && request.method === 'input') {
            event.preventDefault()
            answerUi(conv.key, { value })
          }
        }}
      >
        {request.title && <div className="dialog-title">{request.title}</div>}
        {request.message && <div className="dialog-message">{request.message}</div>}
        {request.method === 'select' && (
          <div className="dialog-options">
            {request.options?.map((option) => (
              <button key={option} className="menu-item" onClick={() => answerUi(conv.key, { value: option })}>
                {option}
              </button>
            ))}
          </div>
        )}
        {request.method === 'input' && <input autoFocus className="field" value={value} placeholder={request.placeholder} onChange={(event) => setValue(event.target.value)} />}
        {request.method === 'editor' && <textarea autoFocus className="field" rows={8} value={value} onChange={(event) => setValue(event.target.value)} />}
        <div className="dialog-actions">
          <button className="btn" onClick={cancel}>
            {t('取消')}
          </button>
          {request.method === 'confirm' && (
            <button className="btn primary" onClick={() => answerUi(conv.key, { confirmed: true })}>
              {t('确定')}
            </button>
          )}
          {(request.method === 'input' || request.method === 'editor') && (
            <button className="btn primary" onClick={() => answerUi(conv.key, { value })}>
              {t('确定')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Welcome({ conv }: { conv: Conv }) {
  return (
    <div className="welcome">
      <div className="welcome-mark">π</div>
      <div className="welcome-title">{t('在 {project} 里做点什么？', { project: baseName(conv.cwd) })}</div>
      <div className="muted small">{conv.cwd}</div>
      <Slot name="welcome" />
      {/* 对话还是空的时候，出错的原因只能显示在这里 */}
      {conv.error && <div className="banner error">{conv.error}</div>}
    </div>
  )
}

export function App() {
  const conv = useApp((s) => (s.activeKey ? s.convs[s.activeKey] : undefined))
  const toasts = useApp((s) => s.toasts)
  const view = useApp((s) => s.view)
  const preview = useApp((s) => s.preview)
  const lightbox = useApp((s) => s.lightbox)
  useEffect(() => {
    if (!lightbox) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setLightbox(undefined)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightbox])
  const paneOpen = useApp((s) => s.prefs.paneOpen && s.view === 'chat')
  const [paneUsed, setPaneUsed] = useState(false)
  useEffect(() => {
    if (paneOpen) setPaneUsed(true)
  }, [paneOpen])
  const collapsed = useApp((s) => s.prefs.sidebarCollapsed)
  const searchOpen = useApp((s) => s.searchOpen)
  const empty = conv && !conv.messages.length && !conv.pending.length && !conv.loading

  // 从侧栏把一个对话拖进聊天窗口：交给当前对话参考
  const [sessionOver, setSessionOver] = useState(false)
  const takesSession = view === 'chat' && Boolean(conv)
  useEffect(() => {
    const off = () => setSessionOver(false)
    window.addEventListener('dragend', off)
    window.addEventListener('drop', off)
    return () => {
      window.removeEventListener('dragend', off)
      window.removeEventListener('drop', off)
    }
  }, [])

  return (
    <div className="app">
      {!collapsed && <Sidebar />}
      <main
        className="main"
        onDragOver={(event) => {
          const types = event.dataTransfer.types
          if (!takesSession || (!types.includes(SESSION_DRAG) && !types.includes(FILE_DRAG))) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          if (types.includes(SESSION_DRAG) && !sessionOver) setSessionOver(true)
        }}
        onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setSessionOver(false)}
        onDrop={(event) => {
          const file = event.dataTransfer.getData(SESSION_DRAG)
          const projectFile = event.dataTransfer.getData(FILE_DRAG)
          setSessionOver(false)
          if ((!file && !projectFile) || !takesSession || !conv) return
          event.preventDefault()
          // 从右侧面板的文件树拖进来的文件：@ 进输入框
          if (projectFile) mentionFile(conv.key, projectFile)
          else void attachSession(conv.key, file)
        }}
      >
        {sessionOver && <div className="drop-hint">{t('松开，把这个对话交给 Pi 参考')}</div>}
        {view === 'settings' ? (
          <Settings />
        ) : view === 'images' ? (
          <Gallery />
        ) : conv ? (
          <>
            <Header conv={conv} />
            <div className="main-row">
              <Rail conv={conv} />
              <div className="main-col">
                {empty ? <Welcome conv={conv} /> : conv.loading ? <div className="welcome muted">{t('正在读取对话…')}</div> : <Chat conv={conv} />}
                <Composer conv={conv} />
              </div>
            </div>
            {conv.uiRequests[0] && <UiDialog key={conv.uiRequests[0].id} conv={conv} request={conv.uiRequests[0]} />}
          </>
        ) : (
          <div className="welcome">
            <div className="welcome-mark">π</div>
            <div className="welcome-title">{t('先选一个项目文件夹')}</div>
            <button className="btn primary" onClick={() => void addProject()}>
              {t('添加文件夹')}
            </button>
          </div>
        )}
        {preview && <ImagePreview key={preview} path={preview} />}
        {lightbox && (
          <div className="overlay preview" onClick={() => setLightbox(undefined)}>
            <img className="lightbox" src={lightbox} alt="" />
          </div>
        )}
      </main>
      {/* 右侧面板打开过一次之后就一直留着，收起时只是藏起来，里面的网页和终端不会断 */}
      {conv && paneUsed && <Pane conv={conv} visible={paneOpen} />}
      {searchOpen && <SearchPalette />}
      <ButtonEditor />
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
