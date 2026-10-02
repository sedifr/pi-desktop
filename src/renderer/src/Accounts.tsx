import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuthFlowEvent, AuthNotice, AuthPrompt, AuthStatus, AuthType, CustomProviderInput, ProviderInfo } from '@shared/types'
import { accountsChanged, api, checkProvider, clearAuthStatus, errorText, toast, useApp } from './store'
import { type DotState, Icon, StatusDot, relTime } from './ui'

interface Flow {
  provider: ProviderInfo
  type: AuthType
  notices: AuthNotice[]
  prompt?: { id: number; prompt: AuthPrompt }
  error?: string
}

const KIND_LABEL: Record<string, string> = { oauth: '订阅账号登录', api_key: 'API Key', config: '自定义接口' }
/** 检测结果超过这么久就在打开页面时重新检测 */
const STALE_MS = 30 * 60_000

/** 服务端的报错常常是一整段 JSON，只取里面给人看的那句 */
function readable(message: string | undefined): string | undefined {
  if (!message) return undefined
  return /"message"\s*:\s*"([^"]+)"/.exec(message)?.[1] ?? message
}

/** 把检测结果变成圆点颜色和一句说明 */
function describeStatus(provider: ProviderInfo, status: AuthStatus | undefined, checking: boolean): { dot: DotState; text: string; detail?: string } {
  if (checking) return { dot: 'checking', text: '检测中…' }
  if (!status) return { dot: 'none', text: '还没检测' }
  const when = relTime(status.at)
  if (status.state === 'ok') return { dot: 'ok', text: `可用 · ${when}检测` }
  if (status.state === 'invalid') {
    const fix = provider.configured === 'oauth' ? '点「重新登录」' : provider.configured === 'api_key' ? '点「换 Key」' : '需要改接口配置里的 Key'
    return { dot: 'invalid', text: `已失效，${fix}`, detail: readable(status.message) }
  }
  return { dot: 'error', text: '没检测成', detail: readable(status.message) }
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
        已经在浏览器里打开登录页面，在那边完成登录后会自动回到这里。
        {notice.instructions && <div className="muted small">{notice.instructions}</div>}
        {notice.url && (
          <button className="link-btn" onClick={() => api.openExternal(notice.url!)}>
            浏览器没打开？点这里再开一次
          </button>
        )}
      </div>
    )
  }
  if (notice.type === 'device_code') {
    return (
      <div className="flow-notice">
        在打开的页面里输入这个代码：
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
  const hint = prompt.type === 'secret' ? '把 API Key 粘贴到这里' : prompt.type === 'manual_code' ? '如果浏览器没有自动跳回来，把最后那个网址或授权码粘贴到这里' : undefined
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
          确定
        </button>
      </div>
    </form>
  )
}

function CustomForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ id: '', api: 'openai-completions' as CustomProviderInput['api'], baseUrl: '', apiKey: '', models: '' })
  const [error, setError] = useState<string>()
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })
  const save = async () => {
    try {
      await api.customProviderSave({ ...form, models: form.models.split(/[\n,，]/) })
      onSaved()
    } catch (e) {
      setError(errorText(e))
    }
  }
  return (
    <div className="custom-form">
      <div className="pop-title">添加自定义接口</div>
      <div className="muted small">适用于中转站、Ollama、LM Studio 等兼容 OpenAI 或 Anthropic 格式的接口。</div>
      <label>
        名称
        <input className="field" value={form.id} placeholder="my-proxy（小写字母、数字、连字符）" onChange={(event) => set({ id: event.target.value })} />
      </label>
      <label>
        接口格式
        <div className="segmented">
          <button className={form.api === 'openai-completions' ? 'on' : ''} onClick={() => set({ api: 'openai-completions' })}>
            OpenAI 兼容
          </button>
          <button className={form.api === 'anthropic-messages' ? 'on' : ''} onClick={() => set({ api: 'anthropic-messages' })}>
            Anthropic 兼容
          </button>
        </div>
      </label>
      <label>
        接口地址
        <input className="field" value={form.baseUrl} placeholder={form.api === 'openai-completions' ? 'https://example.com/v1' : 'https://example.com'} onChange={(event) => set({ baseUrl: event.target.value })} />
      </label>
      <label>
        API Key
        <input className="field" type="password" value={form.apiKey} placeholder="本地服务不需要的话可以留空" onChange={(event) => set({ apiKey: event.target.value })} />
      </label>
      <label>
        模型 ID
        <textarea className="field" rows={3} value={form.models} placeholder={'每行一个，例如：\ngpt-4o\nqwen2.5-coder:7b'} onChange={(event) => set({ models: event.target.value })} />
      </label>
      {error && <div className="banner error">{error}</div>}
      <div className="dialog-actions">
        <button className="btn" onClick={onCancel}>
          取消
        </button>
        <button className="btn primary" onClick={() => void save()}>
          保存
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
  const authStatus = useApp((s) => s.authStatus)
  const authChecking = useApp((s) => s.authChecking)

  const reload = useCallback(() => {
    api.providers().then(setProviders, (error) => toast(`读取模型提供商失败：${errorText(error)}`, 'error'))
  }, [])
  useEffect(reload, [reload])
  useEffect(() => api.onAuthEvent((event) => setFlow((current) => current && applyEvent(current, event))), [])

  const changed = () => {
    accountsChanged()
    reload()
  }

  // 打开页面时，给已连接但没检测过、或检测结果太旧的提供商各检测一次
  useEffect(() => {
    for (const provider of providers ?? []) {
      if (!provider.configured) continue
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
      toast(`${provider.name} 已连接`)
      void checkProvider(provider.id)
    } catch (error) {
      // 用户自己点了取消时窗口已经关了，这里不会再弹错误
      setFlow((current) => current && { ...current, prompt: undefined, error: errorText(error) })
    }
    changed()
  }

  const disconnect = async (provider: ProviderInfo) => {
    const custom = provider.configured === 'config'
    const question = custom ? `移除自定义接口「${provider.name}」？它在 models.json 里的配置会被删掉。` : `退出 ${provider.name}？保存的登录信息会被删掉，之后要用需要重新登录。`
    if (!window.confirm(question)) return
    try {
      if (custom) await api.customProviderRemove(provider.id)
      else await api.authLogout(provider.id)
      clearAuthStatus(provider.id)
      toast(`${provider.name} 已${custom ? '移除' : '退出'}`)
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
      <div className="set-note">
        这里连接的账号和 Pi 命令行、Pi Web 共用。连接之后，这个提供商的模型会出现在对话输入栏的模型列表里。
        <br />
        订阅账号登录会打开浏览器；API Key 只保存在本机 Pi 的凭证文件里。
      </div>

      <div className="cap-section">
        已连接
        <span className="grow" />
        <button className="link-btn" onClick={() => connected.forEach((provider) => void checkProvider(provider.id))}>
          全部重新检测
        </button>
      </div>
      {!providers && <div className="cap-empty">正在读取…</div>}
      {providers && !connected.length && <div className="cap-empty">还没有连接任何模型</div>}
      {connected.map((provider) => {
        const status = describeStatus(provider, authStatus[provider.id], Boolean(authChecking[provider.id]))
        return (
        <div key={provider.id} className="set-row">
          <StatusDot state={status.dot} title={status.detail} />
          <div className="set-label grow">
            {provider.name}
            <div className="muted small">
              {KIND_LABEL[provider.configured!]} · {provider.models} 个模型
            </div>
            <div className={`small status-${status.dot}`} title={status.detail}>
              {status.text}
              {status.detail && status.dot !== 'ok' && <span className="muted">　{status.detail.slice(0, 90)}</span>}
            </div>
          </div>
          <div className="set-control">
            <button className="link-btn" disabled={Boolean(authChecking[provider.id])} onClick={() => void checkProvider(provider.id)}>
              检测
            </button>
            {provider.configured === 'oauth' && (
              <button className="btn" onClick={() => void start(provider, 'oauth')}>
                重新登录
              </button>
            )}
            {provider.configured === 'api_key' && (
              <button className="btn" onClick={() => void start(provider, 'api_key')}>
                换 Key
              </button>
            )}
            <button className="btn" onClick={() => void disconnect(provider)}>
              {provider.configured === 'config' ? '移除' : '退出'}
            </button>
          </div>
        </div>
        )
      })}

      <div className="cap-section spaced">
        添加模型
        <span className="grow" />
        <button className="btn" onClick={() => setCustom(true)}>
          <Icon name="plus" size={13} /> 自定义接口
        </button>
      </div>
      {custom && (
        <CustomForm
          onCancel={() => setCustom(false)}
          onSaved={() => {
            setCustom(false)
            toast('自定义接口已保存')
            changed()
          }}
        />
      )}
      <label className="cap-search wide">
        <Icon name="search" size={13} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜提供商，例如 OpenAI、DeepSeek、Kimi" />
      </label>
      {available.map((provider) => (
        <div key={provider.id} className="set-row">
          <StatusDot state="off" title="还没连接" />
          <div className="set-label grow">
            {provider.name}
            <div className="muted small">未连接 · {provider.models} 个模型</div>
          </div>
          <div className="set-control">
            {provider.methods.map((method) => (
              <button key={method.type} className="btn" title={method.name} onClick={() => void start(provider, method.type)}>
                {method.type === 'oauth' ? (method.subscription ? '登录订阅账号' : '浏览器登录') : '填 API Key'}
              </button>
            ))}
            {!provider.methods.length && <span className="muted small">需要用环境变量或云平台凭证配置</span>}
          </div>
        </div>
      ))}

      {flow && (
        <div className="overlay">
          <div className="dialog">
            <div className="dialog-title">连接 {flow.provider.name}</div>
            {flow.notices.map((notice, index) => (
              <Notice key={index} notice={notice} />
            ))}
            {flow.prompt && <PromptInput key={flow.prompt.id} prompt={flow.prompt.prompt} onSubmit={(value) => api.authAnswer(flow.prompt!.id, value)} />}
            {!flow.prompt && !flow.error && <div className="flow-notice muted">正在等待…</div>}
            {flow.error && <div className="banner error">{flow.error}</div>}
            <div className="dialog-actions">
              <button
                className="btn"
                onClick={() => {
                  if (!flow.error) api.authAbort()
                  setFlow(undefined)
                }}
              >
                {flow.error ? '关闭' : '取消'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
