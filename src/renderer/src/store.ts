import type { AccessLevel, AppAction, UserButton } from '@shared/buttons'
import type { Skin } from '@shared/skins'
import { DEFAULT_LOOK, type Look, applyLook } from './skins'
import { titleFrom } from '@shared/title'
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
  /** 回答进行中发出、还在 Pi 那边排队的消息。撤回时靠它把图片也还回来 */
  queued: PendingMsg[]
  /** 输入框里还没发出去的图片 */
  attachments: ImageAttachment[]
  /** 要给 Pi 参考的别的对话和文档（PDF 这类），发送时变成消息里的文件引用 */
  refs: AttachedRef[]
  /** 从回答里引用的段落，每段下面有自己的回复。发送时拼成「> 原文 + 回复」 */
  quotes: QuoteReply[]
  widgets: Record<string, string[]>
  statuses: Record<string, string>
  /** 扩展在等回答的弹窗。可能同时来好几个，一个个答 */
  uiRequests: UiRequest[]
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
  view: 'chat' | 'settings' | 'images'
  /** 要右侧面板的浏览器打开的地址。n 每次加一，同一个地址连点也能触发 */
  browserRequest?: { url: string; n: number }
  /** 正在放大看的那张图 */
  preview?: string
  /** 正在放大看的、对话里直接带着的图（自己发的图片）。和 preview 不同，它没有文件可以另存或在访达里显示 */
  lightbox?: string
  /** 图片有增减时加一，让开着的图库重新读 */
  imagesVersion: number
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
  /** 皮肤文件夹里的配色文件 */
  userSkins: Skin[]
  /** custom.css 的内容 */
  customCss: string
  /** 自己加的按钮（buttons.json），和读这个文件时发现的问题 */
  buttons: UserButton[]
  buttonsProblem?: string
  buttonsFile?: string
  /** 正在编辑的按钮。isNew 表示还没存进去 */
  buttonEdit?: { button: UserButton; isNew: boolean }
  /** 搜索对话的窗口开着 */
  searchOpen?: boolean
  /** 在当前对话里查找的那一栏开着。findFocus 每按一次 ⌘F 加一，让输入框重新拿到光标 */
  findOpen?: boolean
  findFocus?: number
  /** 打开对话后要滚到的那条消息（从搜索结果点进来时） */
  jump?: { key: string; entryId: string }
  /** 桌面端自己的设置（额外技能文件夹、常用模型） */
  config?: DesktopConfig
}

export type SettingsTab = 'look' | 'custom' | 'caps' | 'market' | 'sources' | 'commands' | 'mcp' | 'accounts' | 'keys' | 'about'

export type ChatWidth = 'normal' | 'wide' | 'full'
/** 每一档对话区最宽到多少。窗口不够宽时都会自动铺满 */
const CHAT_WIDTH: Record<ChatWidth, string> = { normal: '760px', wide: '980px', full: 'none' }

export interface Prefs {
  /** 界面语言。system 表示跟随系统 */
  language: 'system' | Lang
  theme: Theme
  /** 对话正文的字号（像素） */
  fontSize: number
  /** 对话正文和输入框占多宽：标准、宽、铺满整个窗口 */
  chatWidth: ChatWidth
  /** 自己定的外观：背景图、强调色、色调、配色文件 */
  look: Look
  /** 不想看到的界面部件（见「设置 → 个性化」里的清单） */
  hidden: string[]
  /** 左边那列图标放在聊天区的哪一边 */
  railSide: 'left' | 'right'
  /** 对话列表那一栏放在窗口的哪一边 */
  sidebarSide: 'left' | 'right'
  /** 加载桌面端文件夹里的 custom.css */
  customCss: boolean
  sidebarCollapsed: boolean
  /** 窗口不在前台时，回答做完了用系统通知提醒 */
  notify: boolean
  /** 聊天框右边的面板：开着没有、在哪一页、多宽 */
  paneOpen: boolean
  paneTab: PaneTab
  paneWidth: number
}

export type PaneTab = 'files' | 'changes' | 'browser' | 'terminal'

const DEFAULT_PREFS: Prefs = { language: 'system', theme: 'system', fontSize: 14, chatWidth: 'wide', look: DEFAULT_LOOK, hidden: [], railSide: 'left', sidebarSide: 'left', customCss: false, sidebarCollapsed: false, notify: true, paneOpen: false, paneTab: 'changes', paneWidth: 460 }

/** 读一项存在本地的界面设置。坏了或者形状不对就用默认值，不能让它把整个界面拖垮 */
function stored<T>(key: string, fallback: T, ok: (value: unknown) => boolean): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    return ok(value) ? (value as T) : fallback
  } catch {
    return fallback
  }
}
const isRecord = (value: unknown): boolean => typeof value === 'object' && value !== null && !Array.isArray(value)

let state: AppState = {
  sessions: [],
  convs: {},
  toasts: [],
  models: {},
  extraProjects: stored<string[]>('extraProjects', [], (value) => Array.isArray(value) && value.every((item) => typeof item === 'string')),
  view: 'chat',
  userSkins: [],
  customCss: '',
  buttons: [],
  imagesVersion: 0,
  settingsTab: 'look',
  authStatus: stored<Record<string, AuthStatus>>('authStatus', {}, isRecord),
  authChecking: {},
  trust: {},
  prefs: { ...DEFAULT_PREFS, ...stored<Partial<Prefs>>('prefs', {}, isRecord) }
}
const listeners = new Set<() => void>()
let scheduled = false

function notify(): void {
  // 流式输出时事件很密，合并到每帧通知一次
  if (scheduled) return
  scheduled = true
  const flush = () => {
    if (!scheduled) return
    scheduled = false
    for (const listener of listeners) listener()
  }
  requestAnimationFrame(flush)
  // 窗口被挡住或屏幕休眠时不会有「下一帧」，那样界面就一直停在旧状态上。留一个不靠画面刷新的兜底
  setTimeout(flush, 150)
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

export const errorText = (error: unknown): string => {
  const text = String(error instanceof Error ? error.message : error)
    .replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    .trim()
  // Pi 这句话是写给命令行用户的（让人去打 /login、看文档路径），换成这里能照着做的说法
  if (/^No API key found|^No model (selected|available)/i.test(text)) return t('这个模型还没有可用的登录或 API Key。到「设置 → 模型」里连接一个，或者换一个已经连接的模型。')
  return text
}

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
    refs: [],
    quotes: [],
    uiRequests: [],
    queued: [],
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

/**
 * 每个对话这一轮从什么时候开始、最后一次有动静是什么时候。
 * 只给对话底部「正在做什么」那一行每秒读一次，不参与重绘，所以不放进 state。
 */
const activity = new Map<string, { startedAt: number; lastEventAt: number }>()
export const activityOf = (key: string): { startedAt: number; lastEventAt: number } | undefined => activity.get(key)

/** 新的一轮开始了 */
function markStart(key: string): void {
  const now = Date.now()
  activity.set(key, { startedAt: now, lastEventAt: now })
}

function handleEvent(key: string, event: ConvEvent): void {
  // 事件是发给所有窗口的，这个窗口没开着的对话不用管
  if (!state.convs[key]) return
  const e = event as Record<string, any>
  // Pi 发来的任何事件都算「有动静」；以下划线开头的是桌面端自己的状态通知，不算
  if (typeof e.type === 'string' && !e.type.startsWith('_')) {
    const seen = activity.get(key)
    if (seen) seen.lastEventAt = Date.now()
    else markStart(key)
  }
  switch (e.type) {
    case '_status':
      updateConv(key, (c) => {
        if (e.status === 'exited') {
          c.status = 'idle'
          c.streaming = false
          c.shellRunning = false
          c.liveIndex = -1
          c.notice = undefined
          c.toolRuns = {}
          c.uiRequests = []
          // 进程没了，排着队的和还没被接住的消息都发不出去了，还给输入框
          const lost = [...(e.error ? c.pending : []), ...c.queued]
          const texts = lost.length ? lost.map((item) => item.text) : c.queue
          if (texts.some((text) => text.trim())) c.draft = [c.draft, ...texts].filter((text) => text.trim()).join('\n\n')
          if (lost.some((item) => item.images.length)) c.attachments = [...c.attachments, ...lost.flatMap((item) => item.images)]
          if (e.error) c.pending = []
          c.queue = []
          c.queued = []
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
      // 发消息时已经开始计时了；不是自己发起的（比如排队的消息接着跑）才从这里算
      if (!state.convs[key]?.streaming && !state.convs[key]?.pending.length) markStart(key)
      updateConv(key, (c) => {
        c.streaming = true
        c.error = undefined
      })
      break
    case 'agent_end':
      // 只是一小段跑完了。后面可能还有自动重试、压缩、排队的消息，这时 Pi 还不接新消息
      updateConv(key, (c) => {
        c.liveIndex = -1
        c.toolRuns = {}
      })
      break
    case 'agent_settled':
      // 这才是彻底停下
      if (state.convs[key]?.streaming) announceLater(key)
      updateConv(key, (c) => {
        c.streaming = false
        c.liveIndex = -1
        c.notice = undefined
        c.toolRuns = {}
        c.queue = []
        c.queued = []
      })
      void refreshSessions()
      void maybeAutoTitle(key)
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
      updateConv(key, (c) => {
        c.queue = [...(e.steering ?? []), ...(e.followUp ?? [])]
        // 已经被 Pi 取走处理的，不用再替它留着图片了
        const left = [...c.queue]
        c.queued = c.queued.filter((item) => {
          const index = left.indexOf(item.text)
          if (index < 0) return false
          left.splice(index, 1)
          return true
        })
      })
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
      updateConv(key, (c) => (c.uiRequests = [...c.uiRequests, { id: e.id, method: e.method, title: e.title, message: e.message, options: e.options, placeholder: e.placeholder, prefill: e.prefill }]))
      // 带时限的弹窗到点后 Pi 会自己按默认值处理，这边的弹窗也要跟着收掉，不然点了也没用
      if (typeof e.timeout === 'number' && e.timeout > 0) setTimeout(() => updateConv(key, (c) => (c.uiRequests = c.uiRequests.filter((request) => request.id !== e.id))), e.timeout)
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
  document.documentElement.style.setProperty('--chat-max', CHAT_WIDTH[prefs.chatWidth] ?? CHAT_WIDTH.wide)
  applyLook({ ...DEFAULT_LOOK, ...prefs.look }, state.userSkins, (file) => `pi-img://local/${encodeURIComponent(file)}`)
  applyParts(prefs)
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
  // 回到对话时，眼前这个就算看过了
  const key = state.activeKey
  if (view === 'chat' && key && state.convs[key]?.unread) updateConv(key, (c) => (c.unread = false))
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

/** 输入栏处理完一个动作后调用。不清掉的话，下次输入栏重新出现时会把它再做一遍 */
export function consumeSignal(): void {
  if (state.signal) set({ signal: undefined })
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
    case 'search':
      return setSearchOpen(!state.searchOpen)
    case 'resetLook':
      return resetLook()
    case 'find':
      return set({ view: 'chat', findOpen: true, findFocus: (state.findFocus ?? 0) + 1 })
    case 'toggleSidebar':
      return setPrefs({ sidebarCollapsed: !state.prefs.sidebarCollapsed })
    case 'togglePane':
      return setPrefs({ paneOpen: !state.prefs.paneOpen })
    case 'commands':
    case 'model':
      return signal(action)
    case 'stop':
      if (key && (conv?.streaming || conv?.shellRunning)) abort(key)
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
  // 在命令行或别处开的对话，回到这个窗口时要看得到
  window.addEventListener('focus', () => {
    refreshSessionsSoon()
    // 置顶、常用模型这些可能在另一个窗口里改过
    api.configGet().then((latest) => set({ config: latest }), () => {})
  })
  // 外观设置在另一个窗口里改了，这个窗口也跟上
  window.addEventListener('storage', (event) => {
    if (event.key !== 'prefs' || !event.newValue) return
    try {
      const prefs = { ...DEFAULT_PREFS, ...JSON.parse(event.newValue), sidebarCollapsed: state.prefs.sidebarCollapsed, paneOpen: state.prefs.paneOpen, paneTab: state.prefs.paneTab }
      if (prefs.language !== state.prefs.language) return
      set({ prefs })
      applyPrefs(prefs)
    } catch {
      // 读不懂就不动
    }
  })
  listeners.add(saveDraftsSoon)
  void loadSkins()
  void loadCustomCss()
  void loadButtons()
  // 这几个文件不管是谁改的（设置页、编辑器、Pi），改完马上跟上
  api.onDesktopFile((what) => void (what === 'buttons' ? loadButtons() : what === 'css' ? loadCustomCss() : loadSkins()))
  const cwd = localStorage.getItem('lastCwd') ?? sessions[0]?.cwd
  if (cwd) newConv(cwd)
}

export function activate(key: string): void {
  const conv = state.convs[key]
  // 比如点了一条很早的通知，那个对话已经关掉了
  if (!conv) return
  localStorage.setItem('lastCwd', conv.cwd)
  set({ activeKey: key, view: 'chat' })
  if (conv.unread) updateConv(key, (c) => (c.unread = false))
  loadTrust(conv.cwd)
}

export function setConfig(config: DesktopConfig): void {
  set({ config })
}

/** 在右侧面板的浏览器里打开一个地址 */
export function openInBrowser(url: string): void {
  setPrefs({ paneOpen: true, paneTab: 'browser' })
  set({ view: 'chat', browserRequest: { url, n: (state.browserRequest?.n ?? 0) + 1 } })
}

/** 放大看一张图；传空是关掉。changed 为真表示图片有增减，开着的图库要刷新 */
export function previewImage(path: string | undefined, changed = false): void {
  set(changed ? { preview: path, imagesVersion: state.imagesVersion + 1 } : { preview: path })
}

export function setLightbox(src: string | undefined): void {
  set({ lightbox: src })
}

const textBlocks = (message: Msg | undefined): string =>
  Array.isArray(message?.content)
    ? message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n')
    : typeof message?.content === 'string'
      ? message.content
      : ''

/**
 * 回到第 userIndex 条用户消息那里重新来：把它换成 text 再发一次（text 不变就是重新生成）。
 * 这条之后的内容会从当前对话里拿掉，但还留在对话记录里。原来带的图片会一起带上。
 */
export async function resendFrom(key: string, userIndex: number, text: string): Promise<void> {
  const conv = state.convs[key]
  if (!conv) return
  if (conv.streaming || conv.pending.length) return toast(t('正在回答时不能改，先停下来'), 'warning')
  const users = conv.messages.filter((message) => message.role === 'user')
  const original = users[userIndex]
  const clean = text.trim()
  if (!original || !clean) return
  const images: ImageAttachment[] = (Array.isArray(original.content) ? original.content : [])
    .filter((block) => block.type === 'image' && block.data)
    .map((block, index) => ({ name: `image-${index + 1}`, mimeType: block.mimeType ?? 'image/png', data: block.data ?? '' }))
  try {
    await api.convRewind(key, userIndex, textBlocks(original))
    // 画面上也退回到那条消息之前；以文件为准，顺便拿到每条消息在记录里的编号
    const file = state.convs[key]?.sessionFile
    if (file) {
      const data = await api.readSession(file)
      updateConv(key, (c) => {
        c.messages = data.messages
        c.liveIndex = -1
        c.error = undefined
      })
    }
  } catch (error) {
    return toast(errorText(error), 'error')
  }
  // 借输入框把它发出去；输入框里正在写的东西先收起来，发完放回去
  const now = state.convs[key]
  if (!now) return
  const stash = { draft: now.draft, attachments: now.attachments, refs: now.refs, quotes: now.quotes }
  updateConv(key, (c) => Object.assign(c, { draft: clean, attachments: images, refs: [], quotes: [] }), true)
  const sending = send(key)
  updateConv(key, (c) => Object.assign(c, { draft: stash.draft, attachments: stash.attachments, refs: stash.refs, quotes: stash.quotes }), true)
  await sending
}

// ---- 自动起标题 ----

const titled = new Set<string>()
/**
 * 新对话聊完第一轮后让模型起个短标题。只在设置里打开了才做；对话已经有名字、
 * 第一轮出错或被停掉、或者是子代理的对话，都不起。
 */
async function maybeAutoTitle(key: string): Promise<void> {
  const mode = state.config?.autoTitle ?? 'off'
  const conv = state.convs[key]
  if (mode === 'off' || !conv || titled.has(key) || conv.info.sessionName) return
  const users = conv.messages.filter((message) => message.role === 'user')
  const answer = [...conv.messages].reverse().find((message) => message.role === 'assistant')
  if (users.length !== 1 || !answer || answer.stopReason === 'error' || answer.stopReason === 'aborted') return
  const model = mode === 'same' ? (conv.info.model ? `${conv.info.model.provider}/${conv.info.model.id}` : undefined) : mode
  const question = titleFrom(textBlocks(users[0]))
  if (!model || !question) return
  titled.add(key)
  try {
    const title = await api.titleSuggest(model, question, textBlocks(answer))
    // 这期间用户自己改了名，或者对话又在回答了（改名要等它停），就不动
    const latest = state.convs[key]
    if (!latest || latest.info.sessionName || latest.streaming) return
    await rename(key, title)
  } catch {
    // 起不出来就算了，标题还是第一句话
  }
}

/** 左边那列里的四个图标。全都不要时，这一列本身也收掉 */
const RAIL_PARTS = ['rail-skill', 'rail-mcp', 'rail-tool', 'rail-market']

const styleTag = (id: string): HTMLElement => {
  let style = document.getElementById(id)
  if (!style) {
    style = document.createElement('style')
    style.id = id
    document.head.appendChild(style)
  }
  return style
}

/**
 * 把「哪些部件不显示、放在哪一边、要不要加载自己写的样式」落到页面上。
 * 部件只是被藏起来，没有从程序里拿掉；想要回来随时打开。
 */
function applyParts(prefs: Prefs): void {
  const hidden = new Set((prefs.hidden ?? []).filter((id) => /^[\w-]+$/.test(id)))
  // 那一列里还放着自己加的按钮的话，列本身得留着
  if (RAIL_PARTS.every((id) => hidden.has(id)) && !state.buttons.some((button) => button.slot === 'rail')) hidden.add('rail')
  styleTag('pi-parts').textContent = [...hidden].map((id) => `[data-part="${id}"]{display:none !important}`).join('')
  const root = document.documentElement
  root.dataset.rail = prefs.railSide === 'right' ? 'right' : 'left'
  root.dataset.side = prefs.sidebarSide === 'right' ? 'right' : 'left'
  // 自己写的样式排在最后，才盖得过自带的
  const custom = styleTag('pi-custom-css')
  custom.textContent = prefs.customCss ? state.customCss : ''
  document.head.appendChild(custom)
}

/** 显示或隐藏一个界面部件 */
export function togglePart(id: string): void {
  const hidden = state.prefs.hidden ?? []
  setPrefs({ hidden: hidden.includes(id) ? hidden.filter((item) => item !== id) : [...hidden, id] })
}

/** 重新读 custom.css */
export async function loadCustomCss(): Promise<void> {
  try {
    set({ customCss: await api.customCssRead() })
  } catch {
    set({ customCss: '' })
  }
  applyPrefs(state.prefs)
}

/** 外观全部回到出厂的样子：背景图、颜色、部件开关、位置、自己写的样式都还原 */
export function resetLook(): void {
  void api.wallpaperClear().catch(() => {})
  setPrefs({ look: DEFAULT_LOOK, hidden: [], railSide: 'left', sidebarSide: 'left', customCss: false })
  toast(t('外观已恢复默认'))
}

/** 改外观的定制。只传要改的那几项 */
export function setLook(patch: Partial<Look>): void {
  setPrefs({ look: { ...DEFAULT_LOOK, ...state.prefs.look, ...patch } })
}

/** 重新读皮肤文件夹里的配色文件 */
export async function loadSkins(): Promise<void> {
  try {
    set({ userSkins: await api.skinsList() })
  } catch {
    set({ userSkins: [] })
  }
  applyPrefs(state.prefs)
}

// ---- 自己加的按钮 ----

/** 重新读 buttons.json */
export async function loadButtons(): Promise<void> {
  try {
    const file = await api.buttonsGet()
    set({ buttons: file.buttons, buttonsProblem: file.problem, buttonsFile: file.file })
  } catch (error) {
    set({ buttons: [], buttonsProblem: errorText(error) })
  }
  applyParts(state.prefs)
}

/** 把整份按钮存回去。存不了（比如文件被手改坏了）就说明原因，界面上的不动 */
export async function saveButtons(buttons: UserButton[]): Promise<boolean> {
  try {
    const file = await api.buttonsSet(buttons)
    set({ buttons: file.buttons, buttonsProblem: file.problem, buttonsFile: file.file })
    applyParts(state.prefs)
    return true
  } catch (error) {
    toast(errorText(error), 'error')
    return false
  }
}

/** 打开按钮的编辑框。不传就是关掉 */
export function editButton(button?: UserButton, isNew = false): void {
  set({ buttonEdit: button ? { button, isNew } : undefined })
}

/** 新加一个按钮：先打开编辑框，存了才算数 */
export function addButton(preset: Partial<UserButton> = {}): void {
  editButton({ id: `b-${Date.now().toString(36)}`, label: '', slot: 'composer.above', action: { type: 'prompt', text: '', send: true }, ...preset }, true)
}

/** 把一个按钮在它那个位置里往前或往后挪一格 */
export function moveButton(id: string, step: -1 | 1): void {
  const list = state.buttons.slice()
  const from = list.findIndex((button) => button.id === id)
  if (from < 0) return
  // 只和同一个位置里的邻居换；别的位置的按钮夹在中间不算
  let to = from + step
  while (to >= 0 && to < list.length && list[to].slot !== list[from].slot) to += step
  if (to < 0 || to >= list.length) return
  ;[list[from], list[to]] = [list[to], list[from]]
  void saveButtons(list)
}

export function removeButton(id: string): void {
  void saveButtons(state.buttons.filter((button) => button.id !== id))
}

/** 四个内置工具（读、改、写、运行）各档权限开哪几个 */
export const ACCESS_TOOLS = ['read', 'bash', 'edit', 'write']
export const ACCESS_ON: Record<AccessLevel, string[]> = { read: ['read'], edit: ['read', 'edit', 'write'], full: ['read', 'bash', 'edit', 'write'] }

/** 把这次对话切到某一档权限 */
export async function setAccess(key: string, level: AccessLevel): Promise<void> {
  if (!state.convs[key]?.caps) await loadCaps(key)
  const changes: Record<string, CapState> = {}
  for (const name of ACCESS_TOOLS) changes[`tool:${name}`] = ACCESS_ON[level].includes(name) ? 'on' : 'off'
  await changeCaps(key, changes)
}

/** 这几项是 Pi 自带的读、改、写、运行，「最精简」也留着 */
const CORE_TOOLS = new Set(ACCESS_TOOLS.map((name) => `tool:${name}`))

/** 把能关的技能、MCP、扩展全关掉，只留 Pi 自带的四个工具。这样开场带的东西最少，需要什么再单独打开 */
export async function leanCaps(key: string): Promise<void> {
  if (!state.convs[key]?.caps) await loadCaps(key)
  const changes: Record<string, CapState> = {}
  for (const item of state.convs[key]?.caps?.items ?? []) if (!item.locked && !CORE_TOOLS.has(item.id) && item.state !== 'off') changes[item.id] = 'off'
  if (!Object.keys(changes).length) return toast(t('已经是最精简的了'))
  await changeCaps(key, changes)
  toast(t('技能、MCP 和扩展都关掉了，从下一条消息起生效。想以后每次都这样开场，点「设为全局默认」'))
}

/** 界面上现成的功能，按钮可以直接搬来用 */
function runAppAction(action: AppAction): void {
  const key = state.activeKey
  switch (action) {
    case 'newWindow':
      return api.newWindow()
    case 'minimal':
      if (key) void leanCaps(key).catch((error) => toast(errorText(error), 'error'))
      return
    case 'pane:files':
    case 'pane:changes':
    case 'pane:browser':
    case 'pane:terminal':
      setPrefs({ paneOpen: true, paneTab: action.slice(5) as PaneTab })
      return set({ view: 'chat' })
    case 'images':
      return setView('images')
    case 'market':
      return openSettings('market')
    default:
      return handleMenu(action)
  }
}

/** 按下一个自己加的按钮 */
export async function runButton(button: UserButton): Promise<void> {
  const action = button.action
  const key = state.activeKey
  const conv = key ? state.convs[key] : undefined
  try {
    switch (action.type) {
      case 'app':
        return runAppAction(action.do)
      case 'open':
        if (/^https?:\/\//i.test(action.target)) return openInBrowser(action.target)
        return await api.openTarget(action.target)
    }
    // 下面这几种都是对着当前这个对话做的
    if (!key || !conv) return toast(t('先打开一个对话，再点这个按钮'), 'warning')
    if (state.view !== 'chat') set({ view: 'chat' })
    switch (action.type) {
      case 'prompt': {
        const draft = conv.draft.trim()
        if (!action.send) {
          // 放进输入框等人补完。已经写了的字留着，接在后面
          setDraft(key, draft ? `${conv.draft.replace(/\s+$/, '')}\n${action.text}` : action.text)
          return signal('focus')
        }
        // 直接发。输入框里已经写了字，就当成对这段话的补充一起发出去：指令后面跟参数，普通的话另起一段
        setDraft(key, !draft ? action.text : action.text.startsWith('/') ? `${action.text.trim()} ${draft}` : `${action.text.trim()}\n\n${draft}`)
        return await send(key)
      }
      case 'shell': {
        // 运行命令会清空输入框；按钮触发的不该把写到一半的话弄丢
        const draft = conv.draft
        const running = runShell(key, action.command, action.quiet === true)
        if (draft) setDraft(key, draft)
        return await running
      }
      case 'set': {
        if (action.model) {
          await ensureProcess(key)
          const model = state.convs[key]?.info.models?.find((item) => `${item.provider}/${item.id}` === action.model) ?? state.models[action.model]
          if (model) await setModel(key, model)
          else toast(t('没有找到模型 {model}。它要写成「提供商/模型」，并且已经连接好', { model: action.model }), 'warning')
        }
        if (action.thinking) {
          await ensureProcess(key)
          // 每个模型有的档位不一样；没有这一档就说一声，不要悄悄变成别的
          const levels = state.convs[key]?.info.thinkingLevels
          if (levels && !levels.includes(action.thinking)) toast(t('现在这个模型没有「{level}」这一档推理', { level: action.thinking }), 'warning')
          else await setThinking(key, action.thinking)
        }
        if (action.access) await setAccess(key, action.access)
        return
      }
    }
  } catch (error) {
    toast(errorText(error), 'error')
  }
}

/**
 * 让 Pi 来改界面：开一个新对话，把「怎么改」的说明文件交给它，剩下的话由人自己说。
 * 按钮、样式、配色都是桌面端文件夹里的文件，Pi 改完这边马上生效。
 */
export async function askPiToCustomize(): Promise<void> {
  try {
    const guide = await api.customizeGuide()
    // 它多半要改样式文件，开关先打开，不然改了也看不到
    if (!state.prefs.customCss) setPrefs({ customCss: true })
    await loadCustomCss()
    const cwd = (state.activeKey ? state.convs[state.activeKey]?.cwd : undefined) ?? projectDirs(state)[0]
    if (!cwd) return toast(t('先添加一个项目文件夹，才能开对话'), 'warning')
    newConv(cwd)
    const key = state.activeKey
    if (!key) return
    setDraft(key, `${t('先读这份说明，再按我说的改 Pi Desktop 的界面：{path}', { path: guide })}\n\n${t('我想要：')}`)
    signal('focus')
  } catch (error) {
    toast(errorText(error), 'error')
  }
}

export async function setAutoTitle(value: string): Promise<void> {
  try {
    set({ config: await api.autoTitleSet(value) })
  } catch (error) {
    toast(errorText(error), 'error')
  }
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

export function setFindOpen(open: boolean): void {
  set({ findOpen: open })
}

// ---- 没发出去的草稿 ----

/** 每个对话输入框里没发出去的字，按会话文件记着。重启应用、关掉再打开对话都还在 */
const savedDrafts: Record<string, string> = stored<Record<string, string>>('drafts', {}, isRecord)
let draftTimer: ReturnType<typeof setTimeout> | undefined
function saveDraftsSoon(): void {
  draftTimer ??= setTimeout(() => {
    draftTimer = undefined
    let changed = false
    for (const conv of Object.values(state.convs)) {
      if (!conv.sessionFile || conv.loading) continue
      const draft = conv.draft.trim() ? conv.draft : undefined
      if (savedDrafts[conv.sessionFile] === draft) continue
      if (draft) savedDrafts[conv.sessionFile] = draft
      else delete savedDrafts[conv.sessionFile]
      changed = true
    }
    if (!changed) return
    // 只留最近的几十条，别让它一直涨
    const keys = Object.keys(savedDrafts)
    for (const key of keys.slice(0, Math.max(0, keys.length - 60))) delete savedDrafts[key]
    try {
      localStorage.setItem('drafts', JSON.stringify(savedDrafts))
    } catch {
      // 存不下就算了，不影响使用
    }
  }, 800)
}

/**
 * 最后一轮回答出错了：把上一条消息原样再发一次。输入框里正在写的东西先收起来，发完放回去。
 */
export async function retryLast(key: string): Promise<void> {
  const conv = state.convs[key]
  if (!conv || conv.streaming) return
  const last = [...conv.messages].reverse().find((message) => message.role === 'user')
  const text = Array.isArray(last?.content)
    ? last.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n')
    : typeof last?.content === 'string'
      ? last.content
      : ''
  if (!text.trim()) return toast(t('没找到上一条消息，直接在输入框里再说一遍吧'), 'warning')
  const stash = { draft: conv.draft, attachments: conv.attachments, refs: conv.refs, quotes: conv.quotes }
  updateConv(key, (c) => Object.assign(c, { draft: text, attachments: [], refs: [], quotes: [] }), true)
  const sending = send(key)
  // send 一开始就把输入框清空了，这时把刚才收起来的放回去
  updateConv(key, (c) => Object.assign(c, { draft: stash.draft, attachments: stash.attachments, refs: stash.refs, quotes: stash.quotes }), true)
  await sending
}

export function setSearchOpen(open: boolean): void {
  set({ searchOpen: open })
}

/** 从搜索结果打开一个对话；知道是哪条消息对上的，就滚到那条 */
export async function openHit(meta: SessionMeta, entryId?: string): Promise<void> {
  set({ searchOpen: false })
  await openSession(meta)
  const conv = Object.values(state.convs).find((c) => c.key === meta.file || c.sessionFile === meta.file)
  if (conv && entryId) set({ jump: { key: conv.key, entryId } })
}

export function clearJump(): void {
  if (state.jump) set({ jump: undefined })
}

/**
 * 在侧栏里给对话改名。对话开着就走它自己的进程；没开着的，悄悄起一个进程改完就关，不用切过去。
 */
export async function renameSession(meta: SessionMeta, name: string): Promise<void> {
  const clean = name.trim()
  if (!clean || clean === meta.name) return
  const conv = Object.values(state.convs).find((c) => c.key === meta.file || c.sessionFile === meta.file)
  // 先让侧栏显示新名字，改名本身要等进程起来
  set({ sessions: state.sessions.map((item) => (item.file === meta.file ? { ...item, name: clean } : item)) })
  if (conv) return rename(conv.key, clean)
  try {
    await api.convStart(meta.file, meta.cwd, meta.file)
    await api.convSetName(meta.file, clean)
    api.convClose(meta.file)
  } catch (error) {
    toast(t('改名失败：{error}', { error: errorText(error) }), 'error')
  }
  await refreshSessions()
}

/**
 * 挂在输入框上的一个参考：另一个对话，或者一份文档（PDF、Word、PPT、Excel）。
 * 标题给人看；path 是交给 Pi 读的那份文字（对话的文字记录，或者从文档里提取出来的文本）。
 */
export interface AttachedRef {
  kind: 'session' | 'doc'
  title: string
  path: string
  /** 文档的原文件 */
  source?: string
  /** 「3 页」这样的补充说明 */
  detail?: string
  /** 还在提取文字 */
  busy?: boolean
  /** 扫描件，提取不出字 */
  scanned?: boolean
  /** 扫描件有几页已经作为图片附上了 */
  pagesShown?: number
}

/** 模型的读文件工具读不了、要先提取文字的格式 */
const DOC_FILE = /\.(pdf|docx?|rtfd?|odt|webarchive|pptx|xlsx)$/i
export const isDocFile = (file: string): boolean => DOC_FILE.test(file)

/**
 * 附上一份文档：先在输入框上挂一个标签，同时在后台把文字提取出来。
 * 提取不了（比如有密码）就退回成普通的文件引用，让 Pi 自己想办法。
 */
export async function attachDoc(key: string, file: string): Promise<void> {
  const conv = state.convs[key]
  if (!conv || conv.refs.some((ref) => ref.source === file)) return
  const title = file.split('/').pop() ?? file
  updateConv(key, (c) => (c.refs = [...c.refs, { kind: 'doc', title, path: '', source: file, busy: true }]), true)
  const patch = (fn: (refs: AttachedRef[]) => AttachedRef[]) => updateConv(key, (c) => (c.refs = fn(c.refs)), true)
  try {
    const doc = await api.docText(file)
    const unit = doc.kind === 'sheets' ? t('{n} 张表', { n: doc.pages ?? 0 }) : t('{n} 页', { n: doc.pages ?? 0 })
    if (!doc.scanned) return patch((refs) => refs.map((ref) => (ref.source === file ? { ...ref, path: doc.path, busy: false, detail: doc.pages ? unit : undefined } : ref)))
    // 扫描件：没有文字可提取，把前几页画成图片附上，让会看图的模型直接看
    let shown = 0
    try {
      const { renderPdfPages } = await import('./pdfPages')
      const pages = await renderPdfPages(file)
      shown = pages.images.length
      addAttachments(key, pages.images)
      const model = state.convs[key]?.info.model
      toast(
        model?.input && !model.input.includes('image')
          ? t('「{name}」是扫描件，没有能提取的文字。已把前 {n} 页作为图片附上，但当前模型不会看图，换一个能看图的模型再发', { name: title, n: shown })
          : t('「{name}」是扫描件，没有能提取的文字。已把前 {n} 页作为图片附上，让模型直接看', { name: title, n: shown }),
        'warning'
      )
    } catch {
      toast(t('「{name}」是扫描件，里面没有能提取的文字。Pi 只能拿到原文件，要靠看图或文字识别才读得了', { name: title }), 'warning')
    }
    patch((refs) => refs.map((ref) => (ref.source === file ? { ...ref, path: doc.path, busy: false, scanned: true, pagesShown: shown, detail: t('扫描件') } : ref)))
  } catch (error) {
    patch((refs) => refs.filter((ref) => ref.source !== file))
    const draft = state.convs[key]?.draft ?? ''
    setDraft(key, `${draft}${draft && !/\s$/.test(draft) ? ' ' : ''}@${file} `)
    toast(t('没能提取「{name}」里的文字：{error}', { name: title, error: errorText(error) }), 'warning')
  }
}

/** 一个参考在发出去的消息里写成什么 */
function refLine(ref: AttachedRef): string {
  if (ref.kind === 'session') return `${t('参考这个对话的记录：')}@${ref.path}`
  if (ref.scanned && ref.pagesShown) return t('文件「{name}」是扫描件，没有能提取的文字，前 {n} 页已经作为图片附在这条消息里。原文件：{source}', { name: ref.title, n: ref.pagesShown, source: ref.source ?? '' })
  if (ref.scanned) return t('文件「{name}」是扫描件，没有能提取的文字。原文件：{source}', { name: ref.title, source: ref.source ?? '' })
  return t('文件「{name}」的文字内容已经提取出来，读这个：{path}（原文件：{source}）', { name: ref.title, path: `@${ref.path}`, source: ref.source ?? '' })
}

/**
 * 把另一个对话交给当前对话参考：整理出一份文字记录，在输入框里挂一个标签；
 * 发送时它变成消息里的一个文件引用，Pi 自己去读，用到多少读多少。
 */
export async function attachSession(key: string, file: string): Promise<void> {
  const conv = state.convs[key]
  if (!conv) return
  if (conv.key === file || conv.sessionFile === file) return toast(t('这就是当前这个对话'), 'warning')
  try {
    const transcript = await api.sessionTranscript(file)
    const meta = state.sessions.find((item) => item.file === file)
    const title = (meta?.name ?? meta?.firstUserText ?? t('（空对话）')).replace(/\s+/g, ' ').slice(0, 40)
    updateConv(key, (c) => !c.refs.some((ref) => ref.path === transcript) && (c.refs = [...c.refs, { kind: 'session', title, path: transcript }]), true)
  } catch (error) {
    toast(errorText(error), 'error')
  }
}

/** 引用的一段原文，和我对这一段的回复 */
export interface QuoteReply {
  id: number
  text: string
  reply: string
}

let quoteSeq = 0
/**
 * 把回答里选中的一段文字引用到输入框。每段引用是输入框里一个单独的框，下面带它自己的回复栏，
 * 所以可以引用好几段、逐段回复，一次发出去；原文在框里改不了，不会和自己打的字混在一起。
 */
export function quoteInto(key: string, text: string): void {
  const clean = text.replace(/\r/g, '').trim()
  if (!state.convs[key] || !clean) return
  set({ view: 'chat' })
  updateConv(key, (c) => (c.quotes = [...c.quotes, { id: ++quoteSeq, text: clean, reply: '' }]), true)
}

export function setQuoteReply(key: string, id: number, reply: string): void {
  // 和输入框一样立刻更新，不然会打断输入法选字
  updateConv(key, (c) => (c.quotes = c.quotes.map((quote) => (quote.id === id ? { ...quote, reply } : quote))), true)
}

export function removeQuote(key: string, id: number): void {
  updateConv(key, (c) => (c.quotes = c.quotes.filter((quote) => quote.id !== id)))
}

/** 把项目里的一个文件或文件夹 @ 进输入框，Pi 会去读它 */
export function mentionFile(key: string, file: string): void {
  const conv = state.convs[key]
  if (!conv || !file) return
  // PDF 这类文档直接 @ 过去模型读不了，先提取文字
  if (isDocFile(file)) return void attachDoc(key, file.startsWith('/') ? file : `${conv.cwd}/${file}`)
  const draft = conv.draft
  setDraft(key, `${draft}${draft && !/\s$/.test(draft) ? ' ' : ''}@${file} `)
  signal('focus')
}

export function removeRef(key: string, index: number): void {
  updateConv(key, (c) => (c.refs = c.refs.filter((_, i) => i !== index)))
}

/** 复制对话的文字版路径：先整理出文字记录，再把路径放进剪贴板 */
export async function copyTranscriptPath(file: string): Promise<void> {
  try {
    await copyText(await api.sessionTranscript(file))
  } catch (error) {
    toast(errorText(error), 'error')
  }
}

/** 把一个对话置顶，或者取消置顶 */
export async function togglePin(meta: SessionMeta): Promise<void> {
  const current = state.config?.pinned ?? []
  await setPinned(current.includes(meta.id) ? current.filter((id) => id !== meta.id) : [...current, meta.id])
}

/** 存下置顶的对话和它们的顺序 */
export async function setPinned(ids: string[]): Promise<void> {
  // 先改界面再存，拖动排序才不会顿一下
  if (state.config) set({ config: { ...state.config, pinned: ids } })
  try {
    set({ config: await api.pinnedSet(ids) })
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
  // 上次在这个对话里没发出去的字
  conv.draft = savedDrafts[meta.file] ?? ''
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
  // 交给主进程去放：窗口不在前台时，网页自己的剪贴板接口会拒绝
  api.clipboardText(text)
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
        // Pi 压缩前会先把正在进行的回答停掉，所以不能在回答中途悄悄触发
        if (conv.streaming) {
          toast(t('正在回答时不能压缩。等它做完，或者先停下来'), 'warning')
          return true
        }
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
  const refs = conv.refs
  const quotes = conv.quotes
  if (!text && !images.length && !refs.length && !quotes.length) return
  if (refs.some((ref) => ref.busy)) return toast(t('文件里的文字还在提取，稍等一下再发'), 'warning')

  const command = /^\/(\S+)\s*([\s\S]*)$/.exec(text)
  if (command && (NATIVE_COMMANDS as readonly string[]).includes(command[1])) {
    updateConv(key, (c) => (c.draft = ''), true)
    await runCommand(key, command[1], command[2].trim())
    return
  }

  // ! 开头是直接运行一条命令，!! 是运行但不把结果带给模型
  const bang = /^(!!?)\s*(\S[\s\S]*)$/.exec(text)
  if (bang && !images.length && !quotes.length) return runShell(key, bang[2], bang[1] === '!!')

  // 引用的段落写成「> 原文」，下面跟着对它的回复；模型和人都看得懂
  const quoted = quotes.map((quote) =>
    [
      quote.text
        .split('\n')
        .map((line) => (line.trim() ? `> ${line}` : '>'))
        .join('\n'),
      quote.reply.trim()
    ]
      .filter(Boolean)
      .join('\n')
  )
  // 正文以 / 开头是指令，得留在最前面；否则先逐段回复，再说别的
  const main = (text.startsWith('/') ? [text, ...quoted] : [...quoted, text]).filter(Boolean).join('\n\n')
  // 引用的对话放在最后
  const body = [main, ...refs.map(refLine)].filter(Boolean).join('\n')
  const pending: PendingMsg = { text: body, images }
  if (!conv.streaming) markStart(key)
  updateConv(
    key,
    (c) => {
      c.draft = ''
      c.attachments = []
      c.refs = []
      c.quotes = []
      c.error = undefined
      if (c.streaming) c.queued = [...c.queued, pending]
      else c.pending = [...c.pending, pending]
      if (!c.title && body) c.title = titleFrom(body).slice(0, 60)
    },
    true
  )
  try {
    await ensureProcess(key)
    const disposition = await api.convPrompt(key, body, images, behavior)
    // 被扩展命令直接处理掉的消息不会回显，把占位的那条拿掉
    if (disposition === 'handled') updateConv(key, (c) => (c.pending = c.pending.filter((item) => item !== pending)))
    const caps = state.convs[key]?.caps
    if (caps?.dirty) updateConv(key, (c) => (c.caps = { ...caps, dirty: false }))
  } catch (error) {
    updateConv(key, (c) => {
      c.pending = c.pending.filter((item) => item !== pending)
      c.queued = c.queued.filter((item) => item !== pending)
      // 没发出去的放回输入框；这期间已经开始打的下一条接在后面，不覆盖
      c.draft = [text, c.draft].filter((part) => part.trim()).join('\n\n')
      c.attachments = [...images, ...c.attachments]
      c.refs = [...refs, ...c.refs]
      c.quotes = [...quotes, ...c.quotes]
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
    // 进程已经跟着去了新对话；原来的对话下次用到时会另起一个。
    // 主进程那边已经不认原来的临时名字了，原对话从此用它的会话文件来称呼，
    // 不然它的技能和权限开关会读写到别处去
    const previousKey = conv.sessionFile ?? key
    const previous = { ...conv, key: previousKey, status: 'idle' as const, streaming: false, liveIndex: -1, stats: undefined }
    const convs = { ...state.convs }
    delete convs[key]
    state = { ...state, convs: { ...convs, [previousKey]: previous, [next.key]: next } }
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
  // 只作废清单。进程要不要重启由主进程决定，它重启时会自己通知过来
  for (const [key, conv] of Object.entries(state.convs)) convs[key] = { ...conv, info: { ...conv.info, commands: undefined } }
  set({ convs })
}

/** 把撤回来的排队消息放回输入框，接在已有内容后面 */
function restoreQueued(key: string, texts: string[], held: PendingMsg[]): void {
  if (!texts.length && !held.some((item) => item.images.length)) return
  updateConv(
    key,
    (c) => {
      // Pi 只还回文字；图片是这边自己记着的
      const images = held.flatMap((item) => item.images)
      c.draft = [c.draft, ...texts].filter((text) => text.trim()).join('\n\n')
      if (images.length) c.attachments = [...c.attachments, ...images]
      c.queue = []
      c.queued = []
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
  // 先记下排队的那几条：撤回时 Pi 会报「队列空了」，那时这边的记录也跟着清掉了
  const held = state.convs[key]?.queued ?? []
  api.convAbort(key).then(
    (texts) => restoreQueued(key, texts, texts.length ? held : []),
    (error) => toast(errorText(error), 'error')
  )
}

/** 撤回排队中的消息，放回输入框 */
export async function recallQueue(key: string): Promise<void> {
  const held = state.convs[key]?.queued ?? []
  try {
    const texts = await api.convClearQueue(key)
    restoreQueued(key, texts, texts.length ? held : [])
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
  markStart(key)
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
  const conv = state.convs[key]
  if (!conv) return
  if (conv.status === 'idle') return startInBackground(key)
  // 进程还在，但模型或指令清单被作废了（账号、指令、技能有变动）：让主进程重新读一遍
  if (conv.status === 'ready' && (!conv.info.models || !conv.info.commands)) void api.convSync(key).catch(() => {})
}

export async function setModel(key: string, model: ModelInfo): Promise<void> {
  const before = state.convs[key]?.info.model
  updateConv(key, (c) => (c.info = { ...c.info, model }))
  try {
    await ensureProcess(key)
    await api.convSetModel(key, model.provider, model.id)
  } catch (error) {
    updateConv(key, (c) => (c.info = { ...c.info, model: before }))
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
  const request = state.convs[key]?.uiRequests[0]
  if (!request) return
  api.convUiResponse(key, { id: request.id, ...payload })
  updateConv(key, (c) => (c.uiRequests = c.uiRequests.filter((item) => item.id !== request.id)))
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

/**
 * 把一个对话移到另一个项目。以后它在那个项目的文件夹里接着做；已经写好、改过的文件不动。
 */
export async function moveSession(meta: SessionMeta, cwd: string): Promise<void> {
  if (meta.cwd === cwd) return
  const conv = Object.values(state.convs).find((c) => c.key === meta.file || c.sessionFile === meta.file)
  if (conv && (conv.streaming || conv.shellRunning)) return toast(t('这个对话正在运行，等它停下来再移'), 'warning')
  try {
    const file = await api.moveSession(meta.file, cwd)
    // 原来的项目要是只有这一个对话，移走后它会从侧栏消失。留着它，不想要可以自己点「移除」
    if (!state.extraProjects.includes(meta.cwd)) {
      const extraProjects = [...state.extraProjects, meta.cwd]
      localStorage.setItem('extraProjects', JSON.stringify(extraProjects))
      set({ extraProjects })
    }
    const wasActive = conv && state.activeKey === conv.key
    if (conv) {
      const convs = { ...state.convs }
      delete convs[conv.key]
      set({ convs, activeKey: wasActive ? undefined : state.activeKey })
    }
    await refreshSessions()
    const moved = state.sessions.find((item) => item.file === file)
    if (wasActive && moved) {
      await openSession(moved)
      // 输入框里没发出去的字带过去
      if (conv.draft) setDraft(file, conv.draft)
    }
    toast(t('已移到「{project}」', { project: cwd.split('/').filter(Boolean).pop() ?? cwd }))
  } catch (error) {
    toast(t('移动失败：{error}', { error: errorText(error) }), 'error')
  }
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
    if (state.config?.pinned.includes(meta.id)) void setPinned(state.config.pinned.filter((id) => id !== meta.id))
    await refreshSessions()
  } catch (error) {
    toast(t('删除失败：{error}', { error: errorText(error) }), 'error')
  }
}
