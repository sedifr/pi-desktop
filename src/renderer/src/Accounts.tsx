import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthFlowEvent, AuthNotice, AuthPrompt, AuthStatus, AuthType, BalanceInfo, CustomProviderDetail, CustomProviderInput, ProviderInfo } from '@shared/types'
import { accountsChanged, api, checkProvider, clearAuthStatus, errorText, loadBalances, setBalanceAlert, toast, useApp } from './store'
import { type DotState, Hint, Icon, StatusDot, money, relTime } from './ui'
import { t } from '@shared/i18n'

interface Flow {
  provider: ProviderInfo
  type: AuthType
  notices: AuthNotice[]
  prompt?: { id: number; prompt: AuthPrompt }
  error?: string
}

const KIND_LABEL: Record<string, string> = { oauth: t('订阅账号登录'), api_key: 'API Key', config: t('自定义接口') }
/** 检测结果超过这么久就在打开页面时重新检测 */
const STALE_MS = 30 * 60_000

/** 服务端的报错常常是一整段 JSON，只取里面给人看的那句 */
function readable(message: string | undefined): string | undefined {
  if (!message) return undefined
  return /"message"\s*:\s*"([^"]+)"/.exec(message)?.[1] ?? message
}

/** 把检测结果变成圆点颜色和一句说明 */
function describeStatus(provider: ProviderInfo, status: AuthStatus | undefined, checking: boolean): { dot: DotState; text: string; detail?: string } {
  // 只有分类之类的模型，没法拿一句对话去检测
  if (provider.models === 0) return { dot: 'none', text: t('没有对话模型') }
  if (checking) return { dot: 'checking', text: t('检测中…') }
  if (!status) return { dot: 'none', text: t('还没检测') }
  const when = relTime(status.at)
  if (status.state === 'ok') return { dot: 'ok', text: t('可用 · {when}检测', { when }) }
  if (status.state === 'quota') return { dot: 'invalid', text: t('额度用完了'), detail: readable(status.message) }
  if (status.state === 'invalid') {
    const fix = provider.configured === 'oauth' ? t('点「重新登录」') : provider.configured === 'api_key' ? t('点「换 Key」') : provider.configured === 'env' ? (provider.envVar ? t('需要改终端配置里的 {name}', { name: provider.envVar }) : t('需要改本机环境里的凭证')) : t('需要改接口配置里的 Key')
    return { dot: 'invalid', text: t('已失效，{fix}', { fix }), detail: readable(status.message) }
  }
  return { dot: 'error', text: t('没检测成'), detail: readable(status.message) }
}

/** 鼠标停在余额上看的细节：订阅用了多少、另外的额度、没查到的原因 */
function balanceDetail(info: BalanceInfo): string | undefined {
  const lines: string[] = []
  if (info.usage?.session !== undefined || info.usage?.weekly !== undefined) {
    lines.push(t('5 小时 {a}% · 本周 {b}%', { a: Math.round(info.usage.session ?? 0), b: Math.round(info.usage.weekly ?? 0) }))
  }
  for (const credit of info.credits ?? []) lines.push(t('另有 {amount}，到 {date}', { amount: money(credit.amount, credit.currency), date: credit.until ?? '?' }))
  if (info.error) lines.push(t('这次没查到：{error}', { error: info.error }))
  return lines.length ? lines.join('\n') : undefined
}

/** 一家的余额：查得到放余额，查不到放链接；有余额的可以设提醒线 */
function BalanceCell({ provider }: { provider: ProviderInfo }) {
  const info = useApp((s) => s.balances?.items.find((item) => item.provider === provider.id))
  const line = useApp((s) => s.config?.balanceAlerts?.[provider.id])
  const [editing, setEditing] = useState(false)
  // 按 Esc 时输入框会因为被卸掉而失去焦点，靠这个标记分清是取消还是保存
  const cancelled = useRef(false)
  if (!info) return null
  const open = () => info.link && api.openExternal(info.link)
  const detail = balanceDetail(info)
  const save = (text: string) => {
    setEditing(false)
    if (cancelled.current) return
    const value = text.trim() === '' ? null : Number(text)
    if (value === null || (Number.isFinite(value) && value >= 0)) void setBalanceAlert(provider.id, value)
  }
  const label = info.amount !== undefined ? money(info.amount, info.currency) : info.note === 'extra_usage_off' ? t('额外用量已关') : info.link ? (provider.configured === 'oauth' ? t('查看用量') : t('查看余额')) : undefined
  return (
    <div className="balance">
      {label && (
        <button className={info.amount !== undefined ? 'balance-amount' : 'link-btn'} title={detail} onClick={open} disabled={!info.link}>
          {label}
          {info.link && <Icon name="external" size={11} />}
        </button>
      )}
      {info.amount !== undefined &&
        (editing ? (
          <input
            autoFocus
            className="field balance-alert"
            type="number"
            min={0}
            step="any"
            defaultValue={line ?? ''}
            onBlur={(event) => save(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                cancelled.current = true
                setEditing(false)
              }
            }}
          />
        ) : (
          <button
            className="balance-bell"
            title={t('余额低于这个数时提醒，留空不提醒')}
            onClick={() => {
              cancelled.current = false
              setEditing(true)
            }}
          >
            <Icon name="bell" size={12} />
            {line ?? '—'}
          </button>
        ))}
    </div>
  )
}

function applyEvent(flow: Flow, event: AuthFlowEvent): Flow {
  switch (event.t) {
    case 'prompt':
      return { ...flow, prompt: { id: event.id, prompt: event.prompt } }
    case 'prompt_cancel':
      return flow.prompt?.id === event.id ? { ...flow, prompt: undefined } : flow
    case 'notify':
      return { ...flow, notices: [...flow.notices, event.event] }
    default:
      return flow
  }
}

function Notice({ notice }: { notice: AuthNotice }) {
  if (notice.type === 'auth_url') {
    return (
      <div className="flow-notice">
        {t('已经在浏览器里打开登录页面，在那边完成登录后会自动回到这里。')}
        {notice.instructions && <div className="muted small">{notice.instructions}</div>}
        {notice.url && (
          <button className="link-btn" onClick={() => api.openExternal(notice.url!)}>
            {t('浏览器没打开？点这里再开一次')}
          </button>
        )}
      </div>
    )
  }
  if (notice.type === 'device_code') {
    return (
      <div className="flow-notice">
        {t('在打开的页面里输入这个代码：')}
        <div className="flow-code">{notice.userCode}</div>
      </div>
    )
  }
  return <div className="flow-notice muted">{notice.message}</div>
}

function PromptInput({ prompt, onSubmit }: { prompt: AuthPrompt; onSubmit: (value: string) => void }) {
  const [value, setValue] = useState('')
  if (prompt.type === 'select') {
    return (
      <div className="dialog-options">
        <div className="dialog-message">{prompt.message}</div>
        {prompt.options?.map((option) => (
          <button key={option.id} className="menu-item" onClick={() => onSubmit(option.id)}>
            <span className="grow">
              {option.label}
              {option.description && <span className="muted small">　{option.description}</span>}
            </span>
          </button>
        ))}
      </div>
    )
  }
  const hint = prompt.type === 'secret' ? t('把 API Key 粘贴到这里') : prompt.type === 'manual_code' ? t('如果浏览器没有自动跳回来，把最后那个网址或授权码粘贴到这里') : undefined
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (value.trim()) onSubmit(value.trim())
      }}
    >
      <div className="dialog-message">
        {hint ?? prompt.message}
        {hint && <div className="muted small">{prompt.message}</div>}
      </div>
      <div className="flow-input">
        <input autoFocus className="field" type={prompt.type === 'secret' ? 'password' : 'text'} value={value} placeholder={prompt.placeholder} onChange={(event) => setValue(event.target.value)} />
        <button className="btn primary" type="submit">
          {t('确定')}
        </button>
      </div>
    </form>
  )
}

function CustomForm({ initial, onSaved, onCancel }: { initial?: CustomProviderDetail; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    id: initial?.id ?? '',
    api: initial?.api ?? ('openai-completions' as CustomProviderInput['api']),
    baseUrl: initial?.baseUrl ?? '',
    apiKey: '',
    models: initial?.models.join('\n') ?? ''
  })
  const [error, setError] = useState<string>()
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })
  const save = async () => {
    try {
      await api.customProviderSave({ ...form, models: form.models.split(/[\n,，]/), editing: Boolean(initial) })
      onSaved()
    } catch (e) {
      setError(errorText(e))
    }
  }
  return (
    <div className="custom-form">
      <div className="pop-title">{initial ? t('修改自定义接口「{name}」', { name: initial.id }) : t('添加自定义接口')}</div>
      <div className="muted small">{t('适用于中转站、Ollama、LM Studio 等兼容 OpenAI 或 Anthropic 格式的接口。')}</div>
      <label>
        {t('名称')}
        <input className="field" value={form.id} disabled={Boolean(initial)} placeholder={t('my-proxy（小写字母、数字、连字符）')} onChange={(event) => set({ id: event.target.value })} />
      </label>
      <label>
        {t('接口格式')}
        <div className="segmented">
          <button className={form.api === 'openai-completions' ? 'on' : ''} onClick={() => set({ api: 'openai-completions' })}>
            {t('OpenAI 兼容')}
          </button>
          <button className={form.api === 'anthropic-messages' ? 'on' : ''} onClick={() => set({ api: 'anthropic-messages' })}>
            {t('Anthropic 兼容')}
          </button>
        </div>
      </label>
      <label>
        {t('接口地址')}
        <input className="field" value={form.baseUrl} placeholder={form.api === 'openai-completions' ? 'https://example.com/v1' : 'https://example.com'} onChange={(event) => set({ baseUrl: event.target.value })} />
      </label>
      <label>
        API Key
        <input className="field" type="password" value={form.apiKey} placeholder={initial?.hasKey ? t('已经存着一个 Key。留空就不换') : t('本地服务不需要的话可以留空')} onChange={(event) => set({ apiKey: event.target.value })} />
      </label>
      <label>
        {t('模型 ID')}
        <textarea className="field" rows={3} value={form.models} placeholder={`${t('每行一个，例如：')}\ngpt-4o\nqwen2.5-coder:7b`} onChange={(event) => set({ models: event.target.value })} />
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

export function Accounts() {
  const [providers, setProviders] = useState<ProviderInfo[]>()
  const [query, setQuery] = useState('')
  const [flow, setFlow] = useState<Flow>()
  const [custom, setCustom] = useState(false)
  const [editing, setEditing] = useState<CustomProviderDetail>()
  const authStatus = useApp((s) => s.authStatus)
  const authChecking = useApp((s) => s.authChecking)
  const balances = useApp((s) => s.balances?.items)

  const reload = useCallback(() => {
    api.providers().then(setProviders, (error) => toast(t('读取模型提供商失败：{error}', { error: errorText(error) }), 'error'))
  }, [])
  useEffect(reload, [reload])
  useEffect(() => api.onAuthEvent((event) => setFlow((current) => current && applyEvent(current, event))), [])
  // 登录弹窗开着时离开这一页，那个登录也要结束掉，不然下次再登录会被它挡住
  useEffect(() => () => api.authAbort(), [])

  const changed = () => {
    accountsChanged()
    reload()
  }

  useEffect(() => void loadBalances(), [])

  // 打开页面时，给已连接但没检测过、或检测结果太旧的提供商各检测一次
  useEffect(() => {
    for (const provider of providers ?? []) {
      if (!provider.configured || provider.models === 0) continue
      const status = authStatus[provider.id]
      if (!status || Date.now() - status.at > STALE_MS) void checkProvider(provider.id)
    }
    // 只在提供商列表变化时触发，不跟着检测结果反复跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers])

  const start = async (provider: ProviderInfo, type: AuthType) => {
    setFlow({ provider, type, notices: [] })
    try {
      await api.authLogin(provider.id, type)
      setFlow(undefined)
      toast(t('{name} 已连接', { name: provider.name }))
      void checkProvider(provider.id)
    } catch (error) {
      // 用户自己点了取消时窗口已经关了，这里不会再弹错误
      setFlow((current) => current && { ...current, prompt: undefined, error: errorText(error) })
      reload()
      return
    }
    changed()
  }

  const disconnect = async (provider: ProviderInfo) => {
    const custom = provider.configured === 'config'
    const question = custom
      ? t('移除自定义接口「{name}」？它在 models.json 里的配置会被删掉。', { name: provider.name })
      : t('退出 {name}？保存的登录信息会被删掉，之后要用需要重新登录。', { name: provider.name })
    if (!window.confirm(question)) return
    try {
      if (custom) await api.customProviderRemove(provider.id)
      else await api.authLogout(provider.id)
      clearAuthStatus(provider.id)
      toast(custom ? t('{name} 已移除', { name: provider.name }) : t('{name} 已退出', { name: provider.name }))
    } catch (error) {
      toast(errorText(error), 'error')
    }
    changed()
  }

  const connected = useMemo(() => (providers ?? []).filter((p) => p.configured), [providers])
  const available = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (providers ?? []).filter((p) => !p.configured && (!q || `${p.name} ${p.id}`.toLowerCase().includes(q)))
  }, [providers, query])

  return (
    <>
      <div className="cap-section">
        {t('已连接')}
        <Hint text={[t('这里连接的账号和 Pi 命令行共用。连接之后，这个提供商的模型会出现在输入框的模型列表里。'), t('订阅账号登录会打开浏览器；API Key 只保存在本机 Pi 的凭证文件里。')].join('\n')} />
        <span className="grow" />
        <button
          className="link-btn"
          onClick={() => {
            connected.filter((provider) => provider.models > 0).forEach((provider) => void checkProvider(provider.id))
            void loadBalances(true)
          }}
        >
          {t('全部重新检测')}
        </button>
      </div>
      {!providers && <div className="cap-empty">{t('正在读取…')}</div>}
      {providers && !connected.length && <div className="cap-empty">{t('还没有连接任何模型')}</div>}
      {connected.map((provider) => {
        const status = describeStatus(provider, authStatus[provider.id], Boolean(authChecking[provider.id]))
        // 登录方式、模型数、检测时间放在鼠标悬停里；行上只在出了问题时说一句
        const kind = provider.configured === 'env' ? (provider.envVar ? t('终端里的 {name}', { name: provider.envVar }) : t('本机环境里的凭证')) : KIND_LABEL[provider.configured!]
        const tip = [kind, t('{n} 个模型', { n: provider.models }), status.text, status.detail].filter(Boolean).join('\n')
        // 额度用完时，右边的余额那一栏已经说明白了，这里不重复
        const explained = authStatus[provider.id]?.state === 'quota' && balances?.some((item) => item.provider === provider.id && (item.amount !== undefined || item.note))
        const problem = (status.dot === 'invalid' || status.dot === 'error') && !explained
        return (
        <div key={provider.id} className="set-row">
          <StatusDot state={status.dot} title={tip} />
          <div className="set-label grow" title={tip}>
            {provider.name}
            {problem && <div className={`small status-${status.dot}`}>{status.text}</div>}
          </div>
          <BalanceCell provider={provider} />
          <div className="set-control">
            {provider.models > 0 && (
              <button className="link-btn" disabled={Boolean(authChecking[provider.id])} onClick={() => void checkProvider(provider.id)}>
                {t('检测')}
              </button>
            )}
            {provider.configured === 'oauth' && (
              <button className="btn" onClick={() => void start(provider, 'oauth')}>
                {t('重新登录')}
              </button>
            )}
            {provider.configured === 'api_key' && (
              <button className="btn" onClick={() => void start(provider, 'api_key')}>
                {t('换 Key')}
              </button>
            )}
            {provider.configured === 'env' &&
              provider.methods.map((method) => (
                <button key={method.type} className="btn" title={method.name} onClick={() => void start(provider, method.type)}>
                  {method.type === 'oauth' ? (method.subscription ? t('登录订阅账号') : t('浏览器登录')) : t('填 API Key')}
                </button>
              ))}
            {provider.configured === 'config' && (
              <button
                className="btn"
                onClick={() =>
                  void api.customProviderGet(provider.id).then(
                    (detail) => detail && setEditing(detail),
                    (error) => toast(errorText(error), 'error')
                  )
                }
              >
                {t('修改')}
              </button>
            )}
            {provider.configured !== 'env' && (
              <button className="btn" onClick={() => void disconnect(provider)}>
                {provider.configured === 'config' ? t('移除') : t('退出')}
              </button>
            )}
          </div>
        </div>
        )
      })}
      {editing && (
        <CustomForm
          key={editing.id}
          initial={editing}
          onCancel={() => setEditing(undefined)}
          onSaved={() => {
            const id = editing.id
            setEditing(undefined)
            toast(t('自定义接口已保存'))
            changed()
            void checkProvider(id)
          }}
        />
      )}

      <div className="cap-section spaced">
        {t('添加模型')}
        <span className="grow" />
        <button className="btn" onClick={() => setCustom(true)}>
          <Icon name="plus" size={13} /> {t('自定义接口')}
        </button>
      </div>
      {custom && (
        <CustomForm
          onCancel={() => setCustom(false)}
          onSaved={() => {
            setCustom(false)
            toast(t('自定义接口已保存'))
            changed()
          }}
        />
      )}
      <label className="cap-search wide">
        <Icon name="search" size={13} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('搜提供商，例如 OpenAI、DeepSeek、Kimi')} />
      </label>
      {available.map((provider) => (
        <div key={provider.id} className="set-row">
          <StatusDot state="off" title={t('还没连接')} />
          <div className="set-label grow" title={t('{n} 个模型', { n: provider.models })}>
            {provider.name}
          </div>
          <div className="set-control">
            {provider.methods.map((method) => (
              <button key={method.type} className="btn" title={method.name} onClick={() => void start(provider, method.type)}>
                {method.type === 'oauth' ? (method.subscription ? t('登录订阅账号') : t('浏览器登录')) : t('填 API Key')}
              </button>
            ))}
            {!provider.methods.length && <span className="muted small">{t('需要用环境变量或云平台凭证配置')}</span>}
          </div>
        </div>
      ))}

      {flow && (
        <div className="overlay">
          <div className="dialog">
            <div className="dialog-title">{t('连接 {name}', { name: flow.provider.name })}</div>
            {flow.notices.map((notice, index) => (
              <Notice key={index} notice={notice} />
            ))}
            {flow.prompt && <PromptInput key={flow.prompt.id} prompt={flow.prompt.prompt} onSubmit={(value) => api.authAnswer(flow.prompt!.id, value)} />}
            {!flow.prompt && !flow.error && <div className="flow-notice muted">{t('正在等待…')}</div>}
            {flow.error && <div className="banner error">{flow.error}</div>}
            <div className="dialog-actions">
              <button
                className="btn"
                onClick={() => {
                  api.authAbort()
                  setFlow(undefined)
                }}
              >
                {flow.error ? t('关闭') : t('取消')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
