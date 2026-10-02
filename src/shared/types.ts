// 主进程和界面共用的类型

export type CapState = 'auto' | 'on' | 'off'
export type CapKind = 'skill' | 'mcp' | 'tool'

export interface CapItem {
  /** `skill:名字`、`mcp:名字`、`tool:名字`、`ext:名字` */
  id: string
  kind: CapKind
  name: string
  /** 一句话中文简介 */
  summary: string
  /** 原始说明（技能自带的那段） */
  description?: string
  path?: string
  /** 不做任何设置时的状态 */
  defaultState: CapState
  /** 技能有「自动」这一档，其它只有开和关 */
  tri: boolean
  state: CapState
  /** 当前状态来自哪一层 */
  from: 'default' | 'global' | 'project' | 'session'
}

export interface CapSnapshot {
  items: CapItem[]
  /** 改动还没应用到正在运行的 Agent 上 */
  dirty: boolean
}

export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
}

export interface SessionMeta {
  file: string
  id: string
  cwd: string
  name?: string
  firstUserText?: string
  created: string
  modified: number
  messageCount: number
  parentSession?: string
  usage: Usage
}

export interface UsageTotals {
  today: Usage
  month: Usage
  byModel: { model: string; usage: Usage }[]
}

export interface ContentBlock {
  type: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  arguments?: unknown
  data?: string
  mimeType?: string
}

export interface Msg {
  /** 会话文件里的条目 id，实时消息没有 */
  entryId?: string
  role: string
  content?: string | ContentBlock[]
  toolCallId?: string
  toolName?: string
  isError?: boolean
  model?: string
  provider?: string
  stopReason?: string
  errorMessage?: string
  timestamp?: number
  usage?: Partial<Usage> & { cost?: { total?: number } }
  /** 工具附带的结构化信息，比如出图工具的保存路径 */
  details?: Record<string, unknown>
  /** role 为 compactionSummary / custom 等时的附加信息 */
  summary?: string
  customType?: string
  display?: boolean
}

export interface SessionData {
  meta: { id: string; cwd: string; name?: string }
  messages: Msg[]
  usage: Usage
  /** 最后一次助手回复时上下文里的 token 数 */
  contextTokens?: number
  model?: { provider: string; id: string }
  thinkingLevel?: string
}

export interface ModelInfo {
  provider: string
  id: string
  name?: string
  contextWindow?: number
  reasoning?: boolean
}

export interface SessionStats {
  userMessages: number
  assistantMessages: number
  toolCalls: number
  totalMessages: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
  cost: number
  contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null }
}

export interface ConvInfo {
  model?: ModelInfo
  thinkingLevel?: string
  thinkingLevels?: string[]
  models?: ModelInfo[]
  sessionFile?: string
  sessionId?: string
  sessionName?: string
  commands?: { name: string; description?: string; source: string }[]
}

/** 主进程发给界面的事件：Pi 原始事件，或以下划线开头的桌面端自有事件 */
export type ConvEvent = { type: string; [k: string]: unknown }

export interface Defaults {
  home: string
  defaultModel?: string
  defaultProvider?: string
  defaultThinkingLevel?: string
  piVersion: string
  appVersion: string
  agentDir: string
  desktopDir: string
}

export type Theme = 'system' | 'light' | 'dark'

export type AuthType = 'oauth' | 'api_key'

/** 一个模型提供商。只有名字、登录方式和是否已配置，不含任何密钥 */
export interface ProviderInfo {
  id: string
  name: string
  /** 这个提供商下有多少个模型 */
  models: number
  methods: { type: AuthType; name: string; subscription: boolean }[]
  /** 已配置的方式；config 表示写在 models.json 里的自定义接口 */
  configured: AuthType | 'config' | null
}

export interface AuthPrompt {
  type: 'text' | 'secret' | 'select' | 'manual_code'
  message: string
  placeholder?: string
  options?: { id: string; label: string; description?: string }[]
}

export interface AuthNotice {
  type: 'info' | 'auth_url' | 'device_code' | 'progress'
  message?: string
  url?: string
  instructions?: string
  userCode?: string
  verificationUri?: string
}

/** 一个提供商的登录现在能不能用。ok 可用；invalid 登录失效或 Key 不对；error 没检测成（网络、限流等） */
export interface AuthStatus {
  state: 'ok' | 'invalid' | 'error'
  message?: string
  /** 检测时用的模型 */
  model?: string
  /** 检测时间（毫秒时间戳） */
  at: number
}

/** 登录过程中辅助脚本发出来的消息 */
export type AuthFlowEvent =
  | { t: 'list'; providers: ProviderInfo[] }
  | { t: 'status'; state: AuthStatus['state']; message?: string; model?: string }
  | { t: 'prompt'; id: number; prompt: AuthPrompt }
  | { t: 'prompt_cancel'; id: number }
  | { t: 'notify'; event: AuthNotice }
  | { t: 'done' }
  | { t: 'error'; message: string }

export interface CustomProviderInput {
  id: string
  api: 'openai-completions' | 'anthropic-messages'
  baseUrl: string
  apiKey: string
  models: string[]
}

/** 设置页里能在访达中打开的位置 */
export type OpenTarget = 'agent' | 'desktop' | 'summaries' | 'extensions'

/** 桌面端自己的设置，存在 Pi 数据目录下的 desktop/config.json */
export interface DesktopConfig {
  /** 额外的技能文件夹：里面的技能默认不启用，可以在对话里按需打开 */
  extraSkillDirs: string[]
}

export interface PiApi {
  defaults(): Promise<Defaults>
  listSessions(): Promise<SessionMeta[]>
  readSession(file: string): Promise<SessionData>
  trashSession(file: string): Promise<void>
  usageTotals(): Promise<UsageTotals>
  pickFolder(): Promise<string | null>
  openExternal(url: string): void

  convStart(key: string, cwd: string, sessionFile?: string): Promise<ConvInfo>
  convPrompt(key: string, text: string): Promise<void>
  convAbort(key: string): Promise<void>
  convSetModel(key: string, provider: string, id: string): Promise<ConvInfo>
  convSetThinking(key: string, level: string): Promise<ConvInfo>
  convCompact(key: string): Promise<void>
  convUiResponse(key: string, payload: Record<string, unknown>): void
  convClose(key: string): void

  capsGet(key: string, cwd: string): Promise<CapSnapshot>
  capsSet(key: string, cwd: string, changes: Record<string, CapState>): Promise<CapSnapshot>
  capsSaveAs(key: string, cwd: string, scope: 'project' | 'global'): Promise<CapSnapshot>
  capsReset(key: string, cwd: string): Promise<CapSnapshot>
  /** 全局默认：所有项目的新对话一开始的状态 */
  capsGlobalGet(): Promise<CapItem[]>
  capsGlobalSet(changes: Record<string, CapState>): Promise<CapItem[]>

  configGet(): Promise<DesktopConfig>
  /** 弹出选文件夹窗口，把选中的文件夹加进额外技能文件夹 */
  skillDirAdd(): Promise<DesktopConfig>
  skillDirRemove(dir: string): Promise<DesktopConfig>

  providers(): Promise<ProviderInfo[]>
  /** 开始登录；过程中的提示通过 onAuthEvent 送来，结束时这个调用才返回 */
  authLogin(provider: string, type: AuthType): Promise<void>
  authAnswer(id: number, value: string | null): void
  authAbort(): void
  authLogout(provider: string): Promise<void>
  /** 发一个最小的请求，检测这个提供商的登录现在是否有效 */
  authCheck(provider: string): Promise<AuthStatus>
  customProviderSave(input: CustomProviderInput): Promise<void>
  customProviderRemove(id: string): Promise<void>
  onAuthEvent(cb: (event: AuthFlowEvent) => void): () => void
  openPath(target: OpenTarget): void
  setTheme(theme: Theme): void
  /** 把界面当前用的语言告诉主进程，主进程发回来的文字才会是同一种语言 */
  setLang(lang: 'zh' | 'en'): void

  onEvent(cb: (key: string, event: ConvEvent) => void): () => void
}
