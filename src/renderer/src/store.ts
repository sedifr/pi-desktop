import { useSyncExternalStore } from 'react'
import type { AuthStatus, CapSnapshot, CapState, ContentBlock, ConvEvent, ConvInfo, Defaults, ModelInfo, Msg, PiApi, SessionMeta, SessionStats, Theme, Usage } from '@shared/types'
import { type Lang, getLang, resolveLang, t } from '@shared/i18n'

declare global {
  interface Window {
    pi: PiApi
  }
}

export const api = window.pi

export interface ToolRun {
  running: boolean
  partial?: Msg
}

export interface UiRequest {
  id: string
  method: 'select' | 'confirm' | 'input' | 'editor'
  title?: string
  message?: string
  options?: string[]
  placeholder?: string
  prefill?: string
}

export interface Conv {
  key: string
  cwd: string
  sessionFile?: string
  title?: string
  messages: Msg[]
  /** 正在流式更新的那条消息在 messages 里的位置 */
  liveIndex: number
  loading: boolean
  status: 'idle' | 'starting' | 'ready'
  error?: string
  streaming: boolean
  info: ConvInfo
  stats?: SessionStats
  fileUsage?: Usage
  contextTokens?: number
  toolRuns: Record<string, ToolRun>
  queue: string[]
  /** 已经发出、还没被 Pi 回显的用户消息 */
  pending: string[]
  widgets: Record<string, string[]>
  statuses: Record<string, string>
  uiRequest?: UiRequest
  notice?: string
  draft: string
  caps?: CapSnapshot
}

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'warning' | 'error'
}

export interface AppState {
  defaults?: Defaults
  sessions: SessionMeta[]
  convs: Record<string, Conv>
  activeKey?: string
  toasts: Toast[]
  /** 见过的模型，用来在进程没启动时也能算上下文占比 */
  models: Record<string, ModelInfo>
  /** 用户手动加进来、还没有会话的项目目录 */
  extraProjects: string[]
  view: 'chat' | 'settings'
  settingsTab: SettingsTab
  prefs: Prefs
  /** 每个提供商的登录是否有效。来自主动检测，也来自对话里真实请求的成败 */
  authStatus: Record<string, AuthStatus>
  authChecking: Record<string, boolean>
}

export type SettingsTab = 'look' | 'caps' | 'accounts' | 'about'

export interface Prefs {
  /** 界面语言。system 表示跟随系统 */
  language: 'system' | Lang
  theme: Theme
  /** 对话正文的字号（像素） */
  fontSize: number
}

const DEFAULT_PREFS: Prefs = { language: 'system', theme: 'system', fontSize: 14 }

let state: AppState = {
  sessions: [],
  convs: {},
  toasts: [],
  models: {},
  extraProjects: JSON.parse(localStorage.getItem('extraProjects') ?? '[]'),
  view: 'chat',
  settingsTab: 'look',
  authStatus: JSON.parse(localStorage.getItem('authStatus') ?? '{}'),
  authChecking: {},
  prefs: { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('prefs') ?? '{}') }
}
const listeners = new Set<() => void>()
let scheduled = false

function notify(): void {
  // 流式输出时事件很密，合并到每帧通知一次
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    for (const listener of listeners) listener()
  })
}

/**
 * 立刻通知，不等下一帧。输入框的内容必须走这条路：
 * 如果晚一帧才更新，React 会先把输入框改回旧内容，输入法正在组的字就被打断了。
 */
function notifyNow(): void {
  for (const listener of listeners) listener()
}

function set(patch: Partial<AppState>): void {
  state = { ...state, ...patch }
  notify()
}

function updateConv(key: string, fn: (conv: Conv) => void, immediate = false): void {
  const current = state.convs[key]
  if (!current) return
  const draft = { ...current }
  fn(draft)
  state = { ...state, convs: { ...state.convs, [key]: draft } }
  if (immediate) notifyNow()
  else notify()
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => selector(state)
  )
}

export const getState = (): AppState => state

let toastSeq = 0
export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastSeq
  set({ toasts: [...state.toasts, { id, text, kind }] })
  setTimeout(() => set({ toasts: state.toasts.filter((t) => t.id !== id) }), kind === 'error' ? 8000 : 4000)
}

export const errorText = (error: unknown): string =>
  String(error instanceof Error ? error.message : error)
    .replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    .trim()

function blankConv(key: string, cwd: string): Conv {
  return {
    key,
    cwd,
    messages: [],
    liveIndex: -1,
    loading: false,
    status: 'idle',
    streaming: false,
    info: {},
    toolRuns: {},
    queue: [],
    pending: [],
    widgets: {},
    statuses: {},
    draft: ''
  }
}

function rememberModels(models: ModelInfo[] | undefined): void {
  if (!models?.length) return
  const next = { ...state.models }
  for (const model of models) next[`${model.provider}/${model.id}`] = model
  state = { ...state, models: next }
}

// ---- 事件 ----

/**
 * 流式更新只带增量（哪个内容块、追加了什么），这里把它拼到正在生成的那条助手消息上。
 * 块结束时事件里带完整内容，用它覆盖拼出来的结果。
 */
function applyDelta(message: Msg, ev: Record<string, any>): Msg {
  const index = ev.contentIndex
  if (typeof index !== 'number') return message
  const content: ContentBlock[] = Array.isArray(message.content) ? message.content.slice() : []
  while (content.length <= index) content.push({ type: 'text', text: '' })
  const current = content[index]
  switch (ev.type) {
    case 'text_start':
      content[index] = { type: 'text', text: '' }
      break
    case 'text_delta':
      content[index] = { type: 'text', text: (current.type === 'text' ? (current.text ?? '') : '') + (ev.delta ?? '') }
      break
    case 'text_end':
      content[index] = { type: 'text', text: ev.content ?? current.text ?? '' }
      break
    case 'thinking_start':
      content[index] = { type: 'thinking', thinking: '' }
      break
    case 'thinking_delta':
      content[index] = { type: 'thinking', thinking: (current.type === 'thinking' ? (current.thinking ?? '') : '') + (ev.delta ?? '') }
      break
    case 'thinking_end':
      content[index] = { type: 'thinking', thinking: ev.content ?? current.thinking ?? '' }
      break
    case 'toolcall_start':
      content[index] = { type: 'toolCall', id: ev.id, name: ev.toolName, arguments: {} }
      break
    case 'toolcall_end':
      if (ev.toolCall) content[index] = ev.toolCall
      break
    default:
      return message
  }
  return { ...message, content }
}

function handleEvent(key: string, event: ConvEvent): void {
  const e = event as Record<string, any>
  switch (e.type) {
    case '_status':
      updateConv(key, (c) => {
        if (e.status === 'exited') {
          c.status = 'idle'
          c.streaming = false
          c.liveIndex = -1
          if (e.error) c.error = e.error
        } else {
          c.status = e.status
          if (e.status === 'starting') c.error = undefined
        }
      })
      break
    case '_info':
      rememberModels(e.info.models)
      updateConv(key, (c) => {
        c.info = { ...c.info, ...e.info }
        if (e.info.sessionFile) c.sessionFile = e.info.sessionFile
        if (e.info.sessionName) c.title = e.info.sessionName
      })
      break
    case '_stats':
      updateConv(key, (c) => (c.stats = e.stats))
      break
    case 'agent_start':
      updateConv(key, (c) => {
        c.streaming = true
        c.error = undefined
      })
      break
    case 'agent_end':
    case 'agent_settled':
      // agent_end 之后 Pi 可能还会自动重试或处理排队的消息，那时会再来一个 agent_start
      if (e.type === 'agent_end' && e.willRetry) break
      updateConv(key, (c) => {
        c.streaming = false
        c.liveIndex = -1
        c.notice = undefined
        c.toolRuns = {}
      })
      void refreshSessions()
      break
    case 'message_start':
    case 'message_end': {
      const message = e.message as Msg | undefined
      // 系统提示词也会作为一条消息发过来，界面不显示它
      if (!message?.role || message.role === 'system') break
      if (e.type === 'message_end') learnAuthFrom(message)
      updateConv(key, (c) => {
        if (e.type === 'message_start') {
          if (message.role === 'user' && c.pending.length) c.pending = c.pending.slice(1)
          c.messages = [...c.messages, message]
          c.liveIndex = c.messages.length - 1
        } else if (c.liveIndex >= 0 && c.messages[c.liveIndex]?.role === message.role) {
          // message_end 带的是最终版本，整条替换掉流式拼出来的内容
          const next = c.messages.slice()
          next[c.liveIndex] = message
          c.messages = next
        }
      })
      break
    }
    case 'message_update':
      updateConv(key, (c) => {
        const live = c.messages[c.liveIndex]
        if (!live || live.role !== 'assistant') return
        const next = c.messages.slice()
        next[c.liveIndex] = applyDelta(live, e.assistantMessageEvent ?? {})
        c.messages = next
      })
      break
    case 'session_info_changed':
      updateConv(key, (c) => (c.title = e.name || c.title))
      break
    case 'thinking_level_changed':
      updateConv(key, (c) => (c.info = { ...c.info, thinkingLevel: e.level }))
      break
    case 'tool_execution_start':
      updateConv(key, (c) => (c.toolRuns = { ...c.toolRuns, [e.toolCallId]: { running: true } }))
      break
    case 'tool_execution_update':
      updateConv(key, (c) => (c.toolRuns = { ...c.toolRuns, [e.toolCallId]: { running: true, partial: { role: 'toolResult', content: e.partialResult?.content } } }))
      break
    case 'tool_execution_end':
      updateConv(key, (c) => (c.toolRuns = { ...c.toolRuns, [e.toolCallId]: { running: false } }))
      break
    case 'queue_update':
      updateConv(key, (c) => (c.queue = [...(e.steering ?? []), ...(e.followUp ?? [])]))
      break
    case 'compaction_start':
      updateConv(key, (c) => (c.notice = t('正在压缩上下文…')))
      break
    case 'compaction_end':
      updateConv(key, (c) => (c.notice = undefined))
      if (e.errorMessage) toast(t('压缩失败：{error}', { error: e.errorMessage }), 'error')
      break
    case 'auto_retry_start':
      updateConv(key, (c) => (c.notice = t('请求出错，{seconds} 秒后重试（第 {attempt}/{max} 次）', { seconds: Math.round((e.delayMs ?? 0) / 1000), attempt: e.attempt, max: e.maxAttempts })))
      break
    case 'auto_retry_end':
      updateConv(key, (c) => (c.notice = undefined))
      if (!e.success && e.finalError) toast(t('重试后仍然失败：{error}', { error: e.finalError }), 'error')
      break
    case 'extension_error':
      toast(t('扩展出错：{error}', { error: e.error }), 'error')
      break
    case 'extension_ui_request':
      handleUiRequest(key, e)
      break
  }
}

/** 扩展是按终端界面写的，文字里带着颜色控制符 */
const stripAnsi = (text: unknown): string => String(text ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')

function handleUiRequest(key: string, e: Record<string, any>): void {
  switch (e.method) {
    case 'select':
    case 'confirm':
    case 'input':
    case 'editor':
      updateConv(key, (c) => (c.uiRequest = { id: e.id, method: e.method, title: e.title, message: e.message, options: e.options, placeholder: e.placeholder, prefill: e.prefill }))
      break
    case 'notify':
      toast(stripAnsi(e.message), e.notifyType ?? 'info')
      break
    case 'setStatus':
      updateConv(key, (c) => {
        const next = { ...c.statuses }
        if (e.statusText) next[e.statusKey] = stripAnsi(e.statusText)
        else delete next[e.statusKey]
        c.statuses = next
      })
      break
    case 'setWidget':
      updateConv(key, (c) => {
        const next = { ...c.widgets }
        if (Array.isArray(e.widgetLines) && e.widgetLines.length) next[e.widgetKey] = e.widgetLines.map(stripAnsi)
        else delete next[e.widgetKey]
        c.widgets = next
      })
      break
    case 'set_editor_text':
      // 有的扩展启动时会塞进几个空格，当成清空处理，不然输入框的提示文字出不来
      updateConv(key, (c) => (c.draft = String(e.text ?? '').trim() ? String(e.text) : ''))
      break
  }
}

// ---- 动作 ----

export async function refreshSessions(): Promise<void> {
  set({ sessions: await api.listSessions() })
}

function applyPrefs(prefs: Prefs): void {
  api.setLang(getLang())
  api.setTheme(prefs.theme)
  document.documentElement.style.setProperty('--chat-size', `${prefs.fontSize}px`)
}

export function setPrefs(patch: Partial<Prefs>): void {
  const prefs = { ...state.prefs, ...patch }
  const next = prefs.language === 'system' ? resolveLang(navigator.language) : prefs.language
  if (next !== getLang()) {
    // 换语言要重新加载界面，正在输出的对话会从画面上消失（对话本身照常保存）
    const busy = Object.values(state.convs).some((conv) => conv.streaming)
    if (busy && !window.confirm(t('切换语言会重新加载界面，正在进行的对话会从画面上消失，但内容照常保存。继续吗？'))) return
    localStorage.setItem('prefs', JSON.stringify(prefs))
    location.reload()
    return
  }
  localStorage.setItem('prefs', JSON.stringify(prefs))
  applyPrefs(prefs)
  set({ prefs })
}

export function setView(view: AppState['view']): void {
  set({ view })
}

export function openSettings(tab: SettingsTab): void {
  set({ view: 'settings', settingsTab: tab })
}

export function setSettingsTab(tab: SettingsTab): void {
  set({ settingsTab: tab })
}

const AUTH_ERROR = /\b(401|403)\b|unauthori[sz]ed|forbidden|invalidated|invalid[^.]{0,20}(api[ _-]?key|token|credential)|expired|authenticat|sign(ing)? in again|log ?in again|not logged in/i

function setAuthStatus(provider: string, status: AuthStatus | undefined): void {
  const authStatus = { ...state.authStatus }
  if (status) authStatus[provider] = status
  else delete authStatus[provider]
  localStorage.setItem('authStatus', JSON.stringify(authStatus))
  set({ authStatus })
}

export function clearAuthStatus(provider: string): void {
  setAuthStatus(provider, undefined)
}

/** 发一个最小的请求检测登录是否有效。同一个提供商同时只跑一个检测 */
export async function checkProvider(provider: string): Promise<void> {
  if (state.authChecking[provider]) return
  set({ authChecking: { ...state.authChecking, [provider]: true } })
  let status: AuthStatus
  try {
    status = await api.authCheck(provider)
  } catch (error) {
    status = { state: 'error', message: errorText(error), at: Date.now() }
  }
  const authChecking = { ...state.authChecking }
  delete authChecking[provider]
  state = { ...state, authChecking }
  setAuthStatus(provider, status)
}

/** 对话里的真实请求也是一次检测：成功说明登录有效，报认证错误说明失效，不用额外发请求 */
function learnAuthFrom(message: Msg): void {
  if (message.role !== 'assistant' || !message.provider) return
  if (message.stopReason === 'stop' || message.stopReason === 'toolUse') {
    if (state.authStatus[message.provider]?.state !== 'ok') setAuthStatus(message.provider, { state: 'ok', model: message.model, at: Date.now() })
  } else if (message.stopReason === 'error' && AUTH_ERROR.test(message.errorMessage ?? '')) {
    setAuthStatus(message.provider, { state: 'invalid', message: message.errorMessage, model: message.model, at: Date.now() })
  }
}

/** 登录、退出或增删了接口之后：旧的模型列表作废，下次打开选择器时重新读 */
export function accountsChanged(): void {
  const convs: Record<string, Conv> = {}
  for (const [key, conv] of Object.entries(state.convs)) convs[key] = { ...conv, info: { ...conv.info, models: undefined } }
  set({ convs })
}

export async function init(): Promise<void> {
  api.onEvent(handleEvent)
  applyPrefs(state.prefs)
  const [defaults, sessions] = await Promise.all([api.defaults(), api.listSessions()])
  set({ defaults, sessions })
  const cwd = localStorage.getItem('lastCwd') ?? sessions[0]?.cwd
  if (cwd) newConv(cwd)
}

export function activate(key: string): void {
  const conv = state.convs[key]
  if (conv) localStorage.setItem('lastCwd', conv.cwd)
  set({ activeKey: key, view: 'chat' })
}

/** 所有项目目录：有过对话的，加上用户手动添加的。最近用过的排前面 */
export function projectDirs(s: Pick<AppState, 'sessions' | 'extraProjects' | 'convs'>): string[] {
  const latest = new Map<string, number>()
  for (const meta of s.sessions) if (meta.cwd) latest.set(meta.cwd, Math.max(latest.get(meta.cwd) ?? 0, meta.modified))
  for (const cwd of s.extraProjects) if (!latest.has(cwd)) latest.set(cwd, 0)
  for (const conv of Object.values(s.convs)) if (!latest.has(conv.cwd)) latest.set(conv.cwd, 0)
  return [...latest.entries()].sort((a, b) => b[1] - a[1]).map(([cwd]) => cwd)
}

/** 把手动添加、还没有对话的项目从侧栏拿掉。只是不再显示，不动磁盘上的文件夹 */
export function removeProject(cwd: string): void {
  const extraProjects = state.extraProjects.filter((dir) => dir !== cwd)
  localStorage.setItem('extraProjects', JSON.stringify(extraProjects))
  const convs = { ...state.convs }
  for (const conv of Object.values(convs)) {
    if (conv.cwd === cwd && !conv.sessionFile && !conv.messages.length && !conv.streaming) {
      api.convClose(conv.key)
      delete convs[conv.key]
    }
  }
  set({ extraProjects, convs, activeKey: state.activeKey && convs[state.activeKey] ? state.activeKey : undefined })
}

/** 打开旧对话时只读了文件，没有启动 Pi 进程；真正要用到进程之前先确保它起来（已在运行时立即返回） */
async function ensureProcess(key: string): Promise<void> {
  const conv = state.convs[key]
  if (conv) await api.convStart(key, conv.cwd, conv.sessionFile)
}

function startInBackground(key: string): void {
  const conv = state.convs[key]
  if (!conv || conv.status !== 'idle') return
  ensureProcess(key).catch((error) => updateConv(key, (c) => (c.error = errorText(error))))
}

export function newConv(cwd: string): void {
  // 当前项目里已经有一个空白的新对话就直接用它
  const existing = Object.values(state.convs).find((c) => c.cwd === cwd && !c.sessionFile && !c.messages.length && !c.streaming)
  if (existing) return activate(existing.key)
  const key = `new:${crypto.randomUUID()}`
  state = { ...state, convs: { ...state.convs, [key]: blankConv(key, cwd) } }
  activate(key)
  startInBackground(key)
}

export async function addProject(): Promise<void> {
  const dir = await api.pickFolder()
  if (!dir) return
  if (!state.extraProjects.includes(dir)) {
    const extraProjects = [...state.extraProjects, dir]
    localStorage.setItem('extraProjects', JSON.stringify(extraProjects))
    set({ extraProjects })
  }
  newConv(dir)
}

export async function openSession(meta: SessionMeta): Promise<void> {
  const existing = Object.values(state.convs).find((c) => c.key === meta.file || c.sessionFile === meta.file)
  if (existing) return activate(existing.key)
  const conv = blankConv(meta.file, meta.cwd)
  conv.sessionFile = meta.file
  conv.title = meta.name ?? meta.firstUserText
  conv.loading = true
  state = { ...state, convs: { ...state.convs, [conv.key]: conv } }
  activate(conv.key)
  try {
    const data = await api.readSession(meta.file)
    updateConv(conv.key, (c) => {
      c.messages = data.messages
      c.loading = false
      c.fileUsage = data.usage
      c.contextTokens = data.contextTokens
      c.info = { ...c.info, model: data.model ? { ...state.models[`${data.model.provider}/${data.model.id}`], ...data.model } : undefined, thinkingLevel: data.thinkingLevel }
    })
  } catch (error) {
    updateConv(conv.key, (c) => {
      c.loading = false
      c.error = errorText(error)
    })
  }
}

export function setDraft(key: string, draft: string): void {
  updateConv(key, (c) => (c.draft = draft), true)
}

export async function send(key: string): Promise<void> {
  const conv = state.convs[key]
  const text = conv?.draft.trim()
  if (!conv || !text) return
  updateConv(key, (c) => {
    c.draft = ''
    c.error = undefined
    if (!c.streaming) c.pending = [...c.pending, text]
    if (!c.title) c.title = text.slice(0, 60)
  })
  try {
    await ensureProcess(key)
    await api.convPrompt(key, text)
    const caps = state.convs[key]?.caps
    if (caps?.dirty) updateConv(key, (c) => (c.caps = { ...caps, dirty: false }))
  } catch (error) {
    updateConv(key, (c) => {
      c.pending = c.pending.filter((p) => p !== text)
      c.draft = c.draft || text
      c.error = errorText(error)
    })
  }
}

export function abort(key: string): void {
  api.convAbort(key).catch((error) => toast(errorText(error), 'error'))
}

/** 模型列表要等 Pi 进程起来才有；打开选择器时按需启动 */
export function ensureStarted(key: string): void {
  startInBackground(key)
}

export async function setModel(key: string, model: ModelInfo): Promise<void> {
  updateConv(key, (c) => (c.info = { ...c.info, model }))
  try {
    await ensureProcess(key)
    await api.convSetModel(key, model.provider, model.id)
  } catch (error) {
    toast(t('切换模型失败：{error}', { error: errorText(error) }), 'error')
  }
}

export async function setThinking(key: string, level: string): Promise<void> {
  updateConv(key, (c) => (c.info = { ...c.info, thinkingLevel: level }))
  try {
    await ensureProcess(key)
    await api.convSetThinking(key, level)
  } catch (error) {
    toast(t('切换推理级别失败：{error}', { error: errorText(error) }), 'error')
  }
}

export function answerUi(key: string, payload: Record<string, unknown>): void {
  const request = state.convs[key]?.uiRequest
  if (!request) return
  api.convUiResponse(key, { id: request.id, ...payload })
  updateConv(key, (c) => (c.uiRequest = undefined))
}

export async function loadCaps(key: string): Promise<void> {
  const conv = state.convs[key]
  if (!conv) return
  try {
    const caps = await api.capsGet(key, conv.cwd)
    updateConv(key, (c) => (c.caps = caps))
  } catch (error) {
    toast(t('读取技能列表失败：{error}', { error: errorText(error) }), 'error')
  }
}

export async function changeCaps(key: string, changes: Record<string, CapState>): Promise<void> {
  const conv = state.convs[key]
  if (!conv?.caps) return
  // 先在界面上改，再让主进程落盘
  const optimistic = conv.caps.items.map((item) => (changes[item.id] ? { ...item, state: changes[item.id], from: 'session' as const } : item))
  updateConv(key, (c) => (c.caps = { items: optimistic, dirty: c.caps?.dirty ?? false }))
  const caps = await api.capsSet(key, conv.cwd, changes)
  updateConv(key, (c) => (c.caps = caps))
}

export async function saveCapsAs(key: string, scope: 'project' | 'global'): Promise<void> {
  const conv = state.convs[key]
  if (!conv) return
  const caps = await api.capsSaveAs(key, conv.cwd, scope)
  updateConv(key, (c) => (c.caps = caps))
  toast(scope === 'project' ? t('已设为这个项目的默认') : t('已设为全局默认'))
}

export async function resetCaps(key: string): Promise<void> {
  const conv = state.convs[key]
  if (!conv) return
  const caps = await api.capsReset(key, conv.cwd)
  updateConv(key, (c) => (c.caps = caps))
}

export async function trashSession(meta: SessionMeta): Promise<void> {
  const conv = Object.values(state.convs).find((c) => c.key === meta.file || c.sessionFile === meta.file)
  if (conv?.streaming) return toast(t('这个对话正在运行，先停下来再删'), 'warning')
  try {
    await api.trashSession(meta.file)
    if (conv) {
      api.convClose(conv.key)
      const convs = { ...state.convs }
      delete convs[conv.key]
      set({ convs, activeKey: state.activeKey === conv.key ? undefined : state.activeKey })
      if (!state.activeKey) newConv(meta.cwd)
    }
    await refreshSessions()
  } catch (error) {
    toast(t('删除失败：{error}', { error: errorText(error) }), 'error')
  }
}
