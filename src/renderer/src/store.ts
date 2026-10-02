import { useSyncExternalStore } from 'react'
import type { AuthStatus, CapSnapshot, CapState, ContentBlock, ConvEvent, ConvInfo, Defaults, DesktopConfig, ImageAttachment, MenuAction, ModelInfo, Msg, PiApi, SessionMeta, SessionStats, Theme, TrustStatus, Usage } from '@shared/types'
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
  pending: PendingMsg[]
  /** 输入框里还没发出去的图片 */
  attachments: ImageAttachment[]
  widgets: Record<string, string[]>
  statuses: Record<string, string>
  uiRequest?: UiRequest
  notice?: string
  draft: string
  caps?: CapSnapshot
  /** 用户用 ! 直接运行的命令还没跑完 */
  shellRunning?: boolean
  /** 不在眼前的时候有了新结果，还没看过 */
  unread?: boolean
}

export interface PendingMsg {
  text: string
  images: ImageAttachment[]
}

/** 菜单栏或快捷键发来的、需要输入栏去响应的动作。n 每次加一，同一个动作连按也能触发 */
export interface UiSignal {
  action: 'commands' | 'model' | 'focus'
  n: number
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
  /** 各个项目文件夹的信任状态 */
  trust: Record<string, TrustStatus>
  /** 正在标题栏里改名的对话 */
  renamingKey?: string
  signal?: UiSignal
  /** 桌面端自己的设置（额外技能文件夹、常用模型） */
  config?: DesktopConfig
}

export type SettingsTab = 'look' | 'caps' | 'sources' | 'commands' | 'mcp' | 'accounts' | 'keys' | 'about'

export interface Prefs {
  /** 界面语言。system 表示跟随系统 */
  language: 'system' | Lang
  theme: Theme
  /** 对话正文的字号（像素） */
  fontSize: number
  sidebarCollapsed: boolean
  /** 窗口不在前台时，回答做完了用系统通知提醒 */
  notify: boolean
}

const DEFAULT_PREFS: Prefs = { language: 'system', theme: 'system', fontSize: 14, sidebarCollapsed: false, notify: true }

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
  trust: {},
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
    attachments: [],
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
      if (state.convs[key]?.streaming) announceLater(key)
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
      // 子代理的会话是在工具调用里建出来的，顺便更新一下列表
      refreshSessionsSoon()
      break
    case 'bash_execution_update':
      updateConv(key, (c) => {
        const index = c.messages.findLastIndex((message) => message.role === 'bashExecution' && message.running)
        if (index < 0) return
        const next = c.messages.slice()
        next[index] = { ...next[index], output: (next[index].output ?? '') + stripAnsi(e.delta) }
        c.messages = next
      })
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
      announce(key, stripAnsi(e.title ?? e.message ?? t('Pi 在等你回答')))
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

/** 子代理自己的会话：名字形如 Explore#d0c8da8a */
export const isSubagent = (meta: SessionMeta): boolean => /#[0-9a-f]{8}$/.test(meta.name ?? '')

/** 子代理名字里给人看的那部分 */
export const subagentLabel = (meta: SessionMeta): string => (meta.name ?? '').replace(/#[0-9a-f]{8}$/, '')

// ---- 提醒 ----

/**
 * 有了需要人看的新结果。对话不在眼前就在侧栏标个点；窗口不在前台再发一条系统通知，
 * 点通知回到这个对话。
 */
function announce(key: string, body: string): void {
  const conv = state.convs[key]
  if (!conv) return
  const away = !document.hasFocus()
  if (key !== state.activeKey || state.view !== 'chat') updateConv(key, (c) => (c.unread = true))
  if (!away || !state.prefs.notify) return
  const note = new Notification(conv.title ?? t('新对话'), { body: body.slice(0, 160) })
  note.onclick = () => {
    api.focusWindow()
    activate(key)
  }
}

const announcing = new Map<string, ReturnType<typeof setTimeout>>()
/** 一轮回答结束后稍等一下再提醒：Pi 可能马上接着处理排队的消息，那就不算做完 */
function announceLater(key: string): void {
  clearTimeout(announcing.get(key))
  announcing.set(
    key,
    setTimeout(() => {
      announcing.delete(key)
      const conv = state.convs[key]
      if (!conv || conv.streaming) return
      const last = [...conv.messages].reverse().find((message) => message.role === 'assistant')
      // 自己按停的不用提醒
      if (last?.stopReason === 'aborted' || /operation was aborted|request was aborted/i.test(last?.errorMessage ?? '')) return
      announce(key, last?.stopReason === 'error' ? t('出错了：{error}', { error: last.errorMessage ?? '' }) : lastAnswer(conv) || t('做完了'))
    }, 800)
  )
}

// ---- 动作 ----

export async function refreshSessions(): Promise<void> {
  set({ sessions: await api.listSessions() })
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined
/** 短时间内多次要求刷新时只刷一次 */
function refreshSessionsSoon(): void {
  refreshTimer ??= setTimeout(() => {
    refreshTimer = undefined
    void refreshSessions()
  }, 3000)
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

function signal(action: UiSignal['action']): void {
  set({ view: 'chat', signal: { action, n: (state.signal?.n ?? 0) + 1 } })
}

function handleMenu(action: MenuAction): void {
  const key = state.activeKey
  const conv = key ? state.convs[key] : undefined
  switch (action) {
    case 'settings':
      return openSettings(state.settingsTab)
    case 'new': {
      const cwd = conv?.cwd ?? projectDirs(state)[0]
      return cwd ? newConv(cwd) : void addProject()
    }
    case 'addProject':
      return void addProject()
    case 'toggleSidebar':
      return setPrefs({ sidebarCollapsed: !state.prefs.sidebarCollapsed })
    case 'commands':
    case 'model':
      return signal(action)
    case 'stop':
      if (key && conv?.streaming) abort(key)
      return
    case 'rename':
      if (key) set({ view: 'chat', renamingKey: key })
      return
    case 'copyLast':
      if (key) void copyLastAnswer(key)
      return
    case 'compact':
      if (key) void runCommand(key, 'compact', '')
      return
    case 'export':
      if (key) void runCommand(key, 'export', '')
      return
  }
}

export async function init(): Promise<void> {
  api.onEvent(handleEvent)
  api.onMenu(handleMenu)
  applyPrefs(state.prefs)
  const [defaults, sessions, config] = await Promise.all([api.defaults(), api.listSessions(), api.configGet()])
  set({ defaults, sessions, config })
  const cwd = localStorage.getItem('lastCwd') ?? sessions[0]?.cwd
  if (cwd) newConv(cwd)
}

export function activate(key: string): void {
  const conv = state.convs[key]
  if (conv) localStorage.setItem('lastCwd', conv.cwd)
  set({ activeKey: key, view: 'chat' })
  if (conv?.unread) updateConv(key, (c) => (c.unread = false))
  if (conv) loadTrust(conv.cwd)
}

export function setConfig(config: DesktopConfig): void {
  set({ config })
}

/** 把一个模型加进常用，或者拿出来 */
export async function toggleFavoriteModel(model: ModelInfo): Promise<void> {
  const id = `${model.provider}/${model.id}`
  const current = state.config?.favoriteModels ?? []
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  try {
    set({ config: await api.favoriteModelsSet(next) })
  } catch (error) {
    toast(errorText(error), 'error')
  }
}

export function loadTrust(cwd: string): void {
  api.trustGet(cwd).then(
    (status) => set({ trust: { ...state.trust, [cwd]: status } }),
    () => {}
  )
}

/** 记下要不要信任这个项目。Pi 只在启动时看这个决定，所以这个项目下的对话都要重新读一遍指令和技能 */
export async function setTrust(cwd: string, decision: boolean | null): Promise<void> {
  try {
    const status = await api.trustSet(cwd, decision)
    set({ trust: { ...state.trust, [cwd]: status } })
    commandsChanged()
    for (const conv of Object.values(state.convs)) if (conv.cwd === cwd && conv.caps) void loadCaps(conv.key)
  } catch (error) {
    toast(errorText(error), 'error')
  }
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
    if (conv.cwd === cwd && conv.key.startsWith('new:') && !conv.messages.length && !conv.pending.length && !conv.streaming) {
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
  // 当前项目里已经有一个空白的新对话就直接用它。
  // 不能拿「有没有会话文件」来判断：Pi 一启动就会报出文件名，哪怕还一个字没写
  const existing = Object.values(state.convs).find((c) => c.cwd === cwd && c.key.startsWith('new:') && !c.messages.length && !c.pending.length && !c.streaming && !c.shellRunning)
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

/** 桌面端自己处理的快捷指令。其余以 / 开头的内容原样交给 Pi（模板、技能、扩展命令） */
export const NATIVE_COMMANDS = ['new', 'compact', 'name', 'export', 'copy', 'settings'] as const

export function setRenaming(key: string | undefined): void {
  set({ renamingKey: key })
}

export async function rename(key: string, name: string): Promise<void> {
  const clean = name.trim()
  if (!clean) return
  updateConv(key, (c) => (c.title = clean))
  try {
    await ensureProcess(key)
    await api.convSetName(key, clean)
    void refreshSessions()
  } catch (error) {
    toast(t('改名失败：{error}', { error: errorText(error) }), 'error')
  }
}

/** 一轮回答里最后那段正文 */
function lastAnswer(conv: Conv): string {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const message = conv.messages[i]
    if (message.role !== 'assistant' || !Array.isArray(message.content)) continue
    const text = message.content
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text)
      .join('\n\n')
    if (text) return text
  }
  return ''
}

export async function copyText(text: string): Promise<void> {
  if (!text) return
  await navigator.clipboard.writeText(text)
  toast(t('已复制'))
}

export async function copyLastAnswer(key: string): Promise<void> {
  const conv = state.convs[key]
  const text = conv ? lastAnswer(conv) : ''
  if (!text) return toast(t('还没有可以复制的回答'), 'warning')
  await copyText(text)
}

/** 执行一条桌面端自己的指令。返回 false 表示这不是桌面端的指令 */
export async function runCommand(key: string, name: string, args: string): Promise<boolean> {
  const conv = state.convs[key]
  if (!conv) return false
  try {
    switch (name) {
      case 'new':
        newConv(conv.cwd)
        return true
      case 'compact':
        updateConv(key, (c) => (c.notice = t('正在压缩上下文…')))
        await ensureProcess(key)
        await api.convCompact(key, args || undefined)
        updateConv(key, (c) => (c.notice = undefined))
        toast(t('上下文已压缩'))
        return true
      case 'name':
        if (args) await rename(key, args)
        else set({ renamingKey: key })
        return true
      case 'export': {
        await ensureProcess(key)
        await api.convExport(key)
        toast(t('已导出，文件在访达里选中了'))
        return true
      }
      case 'copy':
        await copyLastAnswer(key)
        return true
      case 'settings':
        openSettings(state.settingsTab)
        return true
      default:
        return false
    }
  } catch (error) {
    updateConv(key, (c) => (c.notice = undefined))
    toast(errorText(error), 'error')
    return true
  }
}

export function addAttachments(key: string, images: ImageAttachment[]): void {
  if (images.length) updateConv(key, (c) => (c.attachments = [...c.attachments, ...images]))
}

export function removeAttachment(key: string, index: number): void {
  updateConv(key, (c) => (c.attachments = c.attachments.filter((_, i) => i !== index)))
}

/**
 * 发送输入框里的内容。正在回答时发出的消息会排队：
 * steer 是在当前这一步之后插进去，followUp 是等全部做完再处理。
 */
export async function send(key: string, behavior: 'steer' | 'followUp' = 'steer'): Promise<void> {
  const conv = state.convs[key]
  if (!conv) return
  const text = conv.draft.trim()
  const images = conv.attachments
  if (!text && !images.length) return

  const command = /^\/(\S+)\s*([\s\S]*)$/.exec(text)
  if (command && (NATIVE_COMMANDS as readonly string[]).includes(command[1])) {
    updateConv(key, (c) => (c.draft = ''), true)
    await runCommand(key, command[1], command[2].trim())
    return
  }

  // ! 开头是直接运行一条命令，!! 是运行但不把结果带给模型
  const bang = /^(!!?)\s*(\S[\s\S]*)$/.exec(text)
  if (bang && !images.length) return runShell(key, bang[2], bang[1] === '!!')

  const pending: PendingMsg = { text, images }
  updateConv(
    key,
    (c) => {
      c.draft = ''
      c.attachments = []
      c.error = undefined
      if (!c.streaming) c.pending = [...c.pending, pending]
      if (!c.title && text) c.title = text.slice(0, 60)
    },
    true
  )
  try {
    await ensureProcess(key)
    const disposition = await api.convPrompt(key, text, images, behavior)
    // 被扩展命令直接处理掉的消息不会回显，把占位的那条拿掉
    if (disposition === 'handled') updateConv(key, (c) => (c.pending = c.pending.filter((item) => item !== pending)))
    const caps = state.convs[key]?.caps
    if (caps?.dirty) updateConv(key, (c) => (c.caps = { ...caps, dirty: false }))
  } catch (error) {
    updateConv(key, (c) => {
      c.pending = c.pending.filter((item) => item !== pending)
      c.draft = c.draft || text
      c.attachments = c.attachments.length ? c.attachments : images
      c.error = errorText(error)
    })
  }
}

/**
 * 从第几条用户消息另开一个对话。新对话保留那条消息之前的内容，
 * 那条消息的文字放回输入框，可以改了再发。原来的对话不受影响。
 */
export async function forkFrom(key: string, userIndex: number, text: string): Promise<void> {
  const conv = state.convs[key]
  if (!conv) return
  try {
    await ensureProcess(key)
    const result = await api.convFork(key, userIndex, text)
    if (!result) return
    // 新对话的内容就是原对话里那条消息之前的部分
    let seen = -1
    const cut = conv.messages.findIndex((message) => message.role === 'user' && ++seen === userIndex)
    const next = blankConv(result.key, conv.cwd)
    next.sessionFile = result.key.startsWith('new:') ? undefined : result.key
    next.messages = cut >= 0 ? conv.messages.slice(0, cut) : []
    next.draft = result.text
    next.status = 'ready'
    next.info = { ...conv.info, sessionFile: next.sessionFile, sessionName: undefined }
    next.caps = conv.caps
    // 进程已经跟着去了新对话；原来的对话下次用到时会另起一个
    const previous = { ...conv, status: 'idle' as const, streaming: false, liveIndex: -1, stats: undefined }
    state = { ...state, convs: { ...state.convs, [key]: previous, [next.key]: next } }
    activate(next.key)
    await api.convSync(next.key)
    void refreshSessions()
  } catch (error) {
    toast(t('另开对话失败：{error}', { error: errorText(error) }), 'error')
  }
}

/** 快捷指令增删改之后：旧的指令清单作废，下次用到时重新读 */
export function commandsChanged(): void {
  const convs: Record<string, Conv> = {}
  for (const [key, conv] of Object.entries(state.convs)) convs[key] = { ...conv, status: conv.streaming ? conv.status : 'idle', info: { ...conv.info, commands: undefined } }
  set({ convs })
}

/** 把撤回来的排队消息放回输入框，接在已有内容后面 */
function restoreQueued(key: string, texts: string[]): void {
  if (!texts.length) return
  updateConv(
    key,
    (c) => {
      c.draft = [c.draft, ...texts].filter((text) => text.trim()).join('\n\n')
      c.queue = []
    },
    true
  )
}

/** 停下来。排着队的消息会一起撤回、放回输入框，不会在停下后被接着处理 */
export function abort(key: string): void {
  if (state.convs[key]?.shellRunning) {
    api.convAbortBash(key).catch((error) => toast(errorText(error), 'error'))
    return
  }
  api.convAbort(key).then(
    (texts) => restoreQueued(key, texts),
    (error) => toast(errorText(error), 'error')
  )
}

/** 撤回排队中的消息，放回输入框 */
export async function recallQueue(key: string): Promise<void> {
  try {
    restoreQueued(key, await api.convClearQueue(key))
  } catch (error) {
    toast(errorText(error), 'error')
  }
}

/**
 * 直接运行用户敲的一条命令（输入框里 ! 开头）。输出显示在对话里，
 * 下一条消息会把它带给模型；exclude 为真时只给自己看。
 */
export async function runShell(key: string, command: string, exclude: boolean): Promise<void> {
  const conv = state.convs[key]
  if (!conv) return
  if (conv.streaming) return toast(t('正在回答时不能直接运行命令。等它做完，或者先停下来'), 'warning')
  if (conv.shellRunning) return toast(t('上一条命令还在运行'), 'warning')
  updateConv(
    key,
    (c) => {
      c.draft = ''
      c.error = undefined
      c.shellRunning = true
      c.messages = [...c.messages, { role: 'bashExecution', command, output: '', excludeFromContext: exclude, running: true, timestamp: Date.now() }]
    },
    true
  )
  const finish = (patch: (streamed: string) => Partial<Msg>) =>
    updateConv(key, (c) => {
      c.shellRunning = false
      const index = c.messages.findLastIndex((message) => message.role === 'bashExecution' && message.running)
      if (index < 0) return
      const next = c.messages.slice()
      next[index] = { ...next[index], ...patch(next[index].output ?? ''), running: false }
      c.messages = next
    })
  try {
    await ensureProcess(key)
    const result = await api.convBash(key, command, exclude)
    // 输出很长时返回值里只有结尾一段，边跑边收到的才是全的
    finish((streamed) => ({ ...result, output: result.truncated && streamed ? streamed : stripAnsi(result.output) }))
    void refreshSessions()
  } catch (error) {
    finish(() => ({ output: errorText(error), isError: true }))
  }
}

/** 开关「上下文快满时自动压缩」。这是 Pi 的全局设置，对所有对话都生效 */
export async function setAutoCompaction(key: string, enabled: boolean): Promise<void> {
  const before = state.defaults
  if (before) set({ defaults: { ...before, autoCompaction: enabled } })
  try {
    await ensureProcess(key)
    await api.convSetAutoCompaction(key, enabled)
  } catch (error) {
    if (before) set({ defaults: before })
    toast(errorText(error), 'error')
  }
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
