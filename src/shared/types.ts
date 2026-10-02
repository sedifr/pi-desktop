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
  /** role 为 bashExecution 时：用户用 ! 直接运行的命令和它的输出 */
  command?: string
  output?: string
  exitCode?: number
  cancelled?: boolean
  truncated?: boolean
  fullOutputPath?: string
  /** 输出不带给模型 */
  excludeFromContext?: boolean
  /** 还在运行（只在界面里有） */
  running?: boolean
}

/** 直接运行一条命令的结果 */
export interface BashResult {
  output: string
  exitCode?: number
  cancelled: boolean
  truncated: boolean
  fullOutputPath?: string
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
  /** 模型能接收的输入类型，比如 text、image */
  input?: string[]
}

/** 随消息一起发出去的图片。data 是 base64 */
export interface ImageAttachment {
  name: string
  mimeType: string
  data: string
}

/** 一条快捷指令（Pi 的提示词模板）：一个 Markdown 文件，文件名就是命令名 */
export interface TemplateInfo {
  name: string
  scope: 'global' | 'project'
  file: string
  description: string
  argumentHint: string
  body: string
}

/** 一个项目文件夹的信任状态 */
export interface TrustStatus {
  /** 项目里有没有要信任才会加载的东西 */
  needed: boolean
  /** 存下来的决定：信任、不信任，或者还没决定 */
  decision: boolean | null
  /** 这个决定记在哪个文件夹上（可能是上级文件夹） */
  from?: string
  /** 算上 Pi 的默认设置后，现在到底加不加载 */
  trusted: boolean
}

export interface TemplateInput {
  name: string
  scope: 'global' | 'project'
  /** 存成项目指令时要知道是哪个项目 */
  cwd?: string
  description: string
  argumentHint: string
  body: string
  /** 编辑已有指令时带上原来的文件，改名或换范围后旧文件会被删掉 */
  originalFile?: string
}

/** 系统菜单和快捷键触发的动作 */
export type MenuAction = 'settings' | 'new' | 'addProject' | 'stop' | 'commands' | 'model' | 'rename' | 'copyLast' | 'compact' | 'export' | 'toggleSidebar'

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
  commands?: { name: string; description?: string; source: string; argumentHint?: string }[]
  /** 上下文快满时自动压缩。这是 Pi 的全局设置，对所有对话生效 */
  autoCompaction?: boolean
}

/** 主进程发给界面的事件：Pi 原始事件，或以下划线开头的桌面端自有事件 */
export type ConvEvent = { type: string; [k: string]: unknown }

export interface Defaults {
  home: string
  defaultModel?: string
  defaultProvider?: string
  defaultThinkingLevel?: string
  autoCompaction: boolean
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
  /** 是在改一个已有的接口。这时 Key 留空表示不换 */
  editing?: boolean
}

/** 一个自定义接口现在的配置。Key 只说有没有，不给值 */
export interface CustomProviderDetail {
  id: string
  api: CustomProviderInput['api']
  baseUrl: string
  models: string[]
  hasKey: boolean
}

/** 设置页里能在访达中打开的位置 */
export type OpenTarget = 'agent' | 'desktop' | 'summaries' | 'extensions' | 'mcp'

/** 一个装上的 Pi 包 */
export interface PackageInfo {
  /** 装的时候写的来源，比如 npm:包名、git 地址、本机路径 */
  source: string
  kind: 'npm' | 'git' | 'local'
  /** 只加载了包里挑出来的一部分 */
  filtered: boolean
}

/** 一个 MCP 服务。环境变量和请求头里可能有密钥，所以只给名字 */
export interface McpServerInfo {
  name: string
  /** stdio 是在本机启动一个程序，http 是连一个网址 */
  kind: 'stdio' | 'http'
  command?: string
  args: string[]
  url?: string
  description: string
  envKeys: string[]
  headerKeys: string[]
  enabled: boolean
}

export interface McpServerInput {
  name: string
  /** 修改已有服务时，它原来的名字 */
  originalName?: string
  kind: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  description: string
  /** 环境变量（stdio）或请求头（http）。不传表示保持原样 */
  secrets?: Record<string, string>
}

/** 桌面端自己的设置，存在 Pi 数据目录下的 desktop/config.json */
export interface DesktopConfig {
  /** 额外的技能文件夹：里面的技能默认不启用，可以在对话里按需打开 */
  extraSkillDirs: string[]
  /** 常用模型，形如「提供商/模型」。在模型菜单里排在最前面 */
  favoriteModels: string[]
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
  /** 返回 Pi 对这条消息的处理方式：started、queued 或 handled */
  convPrompt(key: string, text: string, images?: ImageAttachment[], behavior?: 'steer' | 'followUp'): Promise<string>
  /** 停止回答。排着队还没处理的消息会被撤回，原文在返回值里 */
  convAbort(key: string): Promise<string[]>
  /** 撤回排队中的消息，返回它们的原文 */
  convClearQueue(key: string): Promise<string[]>
  /** 直接运行一条命令。exclude 为真时输出不带给模型 */
  convBash(key: string, command: string, exclude: boolean): Promise<BashResult>
  convAbortBash(key: string): Promise<void>
  convSetAutoCompaction(key: string, enabled: boolean): Promise<ConvInfo>
  /** 把窗口带到最前面 */
  focusWindow(): void
  convSetModel(key: string, provider: string, id: string): Promise<ConvInfo>
  convSetThinking(key: string, level: string): Promise<ConvInfo>
  convCompact(key: string, instructions?: string): Promise<void>
  convSetName(key: string, name: string): Promise<ConvInfo>
  /** 导出为网页并在访达里显示，返回文件路径 */
  convExport(key: string): Promise<string>
  /** 从第几条用户消息另开对话。返回新对话的 key 和那条消息的文字；被扩展取消时返回 undefined */
  convFork(key: string, userIndex: number, text: string): Promise<{ key: string; text: string } | undefined>
  convSync(key: string): Promise<void>

  templatesList(cwd?: string): Promise<TemplateInfo[]>
  templateSave(input: TemplateInput): Promise<void>
  templateTrash(file: string, cwd?: string): Promise<void>
  filesSearch(cwd: string, query: string): Promise<string[]>
  trustGet(cwd: string): Promise<TrustStatus>
  /** 记下对这个项目的决定；null 是清掉记录 */
  trustSet(cwd: string, decision: boolean | null): Promise<TrustStatus>
  onMenu(cb: (action: MenuAction) => void): () => void
  /** 拖进来或选中的文件在磁盘上的路径 */
  pathForFile(file: File): string
  convUiResponse(key: string, payload: Record<string, unknown>): void
  convClose(key: string): void

  capsGet(key: string, cwd: string): Promise<CapSnapshot>
  capsSet(key: string, cwd: string, changes: Record<string, CapState>): Promise<CapSnapshot>
  capsSaveAs(key: string, cwd: string, scope: 'project' | 'global'): Promise<CapSnapshot>
  capsReset(key: string, cwd: string): Promise<CapSnapshot>
  /** 全局默认：所有项目的新对话一开始的状态 */
  capsGlobalGet(): Promise<CapItem[]>
  capsGlobalSet(changes: Record<string, CapState>): Promise<CapItem[]>

  packagesList(): Promise<PackageInfo[]>
  packageInstall(source: string): Promise<void>
  packageRemove(source: string): Promise<void>
  /** 安装或移除过程中 Pi 打出来的话，一行一行送来 */
  onPackageLine(cb: (line: string) => void): () => void

  /** 还有几项没有自己的简介 */
  summariesMissing(): Promise<number>
  /** 让这个模型（提供商/模型）给没有简介的项各写一句，返回写了几条 */
  summariesGenerate(model: string): Promise<number>
  onSummaryProgress(cb: (done: number, total: number) => void): () => void

  mcpList(): Promise<McpServerInfo[]>
  mcpSave(input: McpServerInput): Promise<void>
  mcpRemove(name: string): Promise<void>

  /** 改一项的简介；传空字符串是恢复成它自带的说明 */
  summarySet(id: string, summary: string): Promise<void>

  configGet(): Promise<DesktopConfig>
  /** 弹出选文件夹窗口，把选中的文件夹加进额外技能文件夹 */
  skillDirAdd(): Promise<DesktopConfig>
  skillDirRemove(dir: string): Promise<DesktopConfig>
  favoriteModelsSet(models: string[]): Promise<DesktopConfig>

  providers(): Promise<ProviderInfo[]>
  /** 开始登录；过程中的提示通过 onAuthEvent 送来，结束时这个调用才返回 */
  authLogin(provider: string, type: AuthType): Promise<void>
  authAnswer(id: number, value: string | null): void
  authAbort(): void
  authLogout(provider: string): Promise<void>
  /** 发一个最小的请求，检测这个提供商的登录现在是否有效 */
  authCheck(provider: string): Promise<AuthStatus>
  customProviderGet(id: string): Promise<CustomProviderDetail | undefined>
  customProviderSave(input: CustomProviderInput): Promise<void>
  customProviderRemove(id: string): Promise<void>
  onAuthEvent(cb: (event: AuthFlowEvent) => void): () => void
  openPath(target: OpenTarget): void
  setTheme(theme: Theme): void
  /** 把界面当前用的语言告诉主进程，主进程发回来的文字才会是同一种语言 */
  setLang(lang: 'zh' | 'en'): void

  onEvent(cb: (key: string, event: ConvEvent) => void): () => void
}
