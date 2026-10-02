import { useEffect, useState } from 'react'
import type { UsageTotals } from '@shared/types'
import { Chat } from './Chat'
import { Composer } from './Composer'
import { Settings } from './Settings'
import { Sidebar } from './Sidebar'
import { type Conv, type UiRequest, addProject, answerUi, api, useApp } from './store'
import { Icon, Popover, baseName, fmtCost, fmtTokens } from './ui'
import { t } from '@shared/i18n'

interface UsageView {
  cost: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  toolCalls?: number
  contextTokens?: number | null
  contextWindow?: number
}

function usageOf(conv: Conv, windowOf: (provider?: string, id?: string) => number | undefined): UsageView | undefined {
  if (conv.stats) {
    const s = conv.stats
    return { cost: s.cost, ...s.tokens, toolCalls: s.toolCalls, contextTokens: s.contextUsage?.tokens, contextWindow: s.contextUsage?.contextWindow }
  }
  if (conv.fileUsage) {
    const model = conv.info.model
    return { ...conv.fileUsage, contextTokens: conv.contextTokens, contextWindow: model?.contextWindow ?? windowOf(model?.provider, model?.id) }
  }
  return undefined
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function UsagePopover({ usage, onClose }: { usage: UsageView; onClose: () => void }) {
  const [totals, setTotals] = useState<UsageTotals>()
  useEffect(() => {
    void api.usageTotals().then(setTotals)
  }, [])
  const read = usage.input + usage.cacheRead + usage.cacheWrite
  const hit = read > 0 ? (usage.cacheRead / read) * 100 : 0
  const percent = usage.contextTokens != null && usage.contextWindow ? (usage.contextTokens / usage.contextWindow) * 100 : undefined
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
        <div className="meter">
          <div style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
      )}
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

function Header({ conv }: { conv: Conv }) {
  const models = useApp((s) => s.models)
  const [open, setOpen] = useState(false)
  const usage = usageOf(conv, (provider, id) => models[`${provider}/${id}`]?.contextWindow)
  const percent = usage?.contextTokens != null && usage.contextWindow ? Math.round((usage.contextTokens / usage.contextWindow) * 100) : undefined
  return (
    <header className="header">
      <span className="header-title ellipsis">{conv.title ?? t('新对话')}</span>
      <span className="muted small" title={conv.cwd}>
        {baseName(conv.cwd)}
      </span>
      <span className="grow" />
      {usage && (
        <div className="anchor no-drag">
          <button className="chip" data-popover-trigger="header" onClick={() => setOpen(!open)}>
            <Icon name="chart" size={14} />
            {fmtCost(usage.cost)}
            {percent != null ? ` · ${percent}%` : ''}
          </button>
          {open && <UsagePopover usage={usage} onClose={() => setOpen(false)} />}
        </div>
      )}
    </header>
  )
}

function UiDialog({ conv, request }: { conv: Conv; request: UiRequest }) {
  const [value, setValue] = useState(request.prefill ?? '')
  const cancel = () => answerUi(conv.key, { cancelled: true })
  return (
    <div className="overlay">
      <div className="dialog">
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
    </div>
  )
}

export function App() {
  const conv = useApp((s) => (s.activeKey ? s.convs[s.activeKey] : undefined))
  const toasts = useApp((s) => s.toasts)
  const view = useApp((s) => s.view)
  const empty = conv && !conv.messages.length && !conv.pending.length && !conv.loading

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {view === 'settings' ? (
          <Settings />
        ) : conv ? (
          <>
            <Header conv={conv} />
            {empty ? <Welcome conv={conv} /> : conv.loading ? <div className="welcome muted">{t('正在读取对话…')}</div> : <Chat conv={conv} />}
            <Composer conv={conv} />
            {conv.uiRequest && <UiDialog key={conv.uiRequest.id} conv={conv} request={conv.uiRequest} />}
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
      </main>
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
