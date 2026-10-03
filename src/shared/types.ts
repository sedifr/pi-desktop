import type { Palette, Skin } from './skins'
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
  /** 扩展包只加载其中这几个文件时，是哪几个 */
  paths?: string[]
  /** 不做任何设置时的状态 */
  defaultState: CapState
  /** 技能有「自动」这一档，其它只有开和关 */
  tri: boolean
  state: CapState
  /** 当前状态来自哪一层 */
  from: 'default' | 'global' | 'project' | 'session'
  /** 这一项现在没法按对话开关，只能看 */
  locked?: boolean
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

/** 检查更新的结果 */
export interface UpdateInfo {
  current: string
  /** 最新发布的版本。还没发布过就没有 */
  latest?: string
  url?: string
  newer?: boolean
}

/** 插件市场里的一个包 */
export interface MarketItem {
  name: string
  version: string
  description: string
  keywords: string[]
  /** 最近一周的下载次数 */
  weekly: number
  updated: string
  publisher?: string
  npm: string
  repo?: string
}

export interface MarketPage {
  items: MarketItem[]
  total: number
  /** 后面还有 */
  more: boolean
}

/** 从一份文档里提取出来的文字 */
export interface DocText {
  /** 提取出来的文本文件在哪 */
  path: string
  /** 原文件 */
  source: string
  name: string
  kind: 'pdf' | 'doc' | 'slides' | 'sheets'
  /** PDF 和 PPT 是页数，Excel 是表的张数 */
  pages?: number
  chars: number
  /** 扫描件：没有文字层，提取不出字 */
  scanned: boolean
}

/** 项目文件夹里的一项 */
export interface DirEntry {
  name: string
  /** 相对项目文件夹的路径 */
  path: string
  dir: boolean
}

export interface DirListing {
  entries: DirEntry[]
  /** 太多没列完时，还剩几项 */
  more: number
}

/** 搜索对话时的一条结果 */
export interface SearchHit {
  file: string
  /** 命中的是哪条消息。只在标题或项目名里命中时没有 */
  entryId?: string
  role?: 'user' | 'assistant'
  /** 命中处前后的一小段文字 */
  snippet?: string
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
  /** 工具附带的结构化信息：出图工具的保存路径（path）、改文件工具的差异（patch） */
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
export type MenuAction = 'settings' | 'new' | 'search' | 'find' | 'resetLook' | 'addProject' | 'stop' | 'commands' | 'model' | 'rename' | 'copyLast' | 'compact' | 'export' | 'toggleSidebar' | 'togglePane'

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

/** 项目里一个有改动的文件 */
export interface ChangedFile {
  /** 相对于项目文件夹的路径 */
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  added?: number
  removed?: number
}

export interface ChangesInfo {
  /** 项目是不是 git 仓库。不是的话没法知道「没提交的改动」，只能看这次对话动过哪些文件 */
  git: boolean
  branch?: string
  files: ChangedFile[]
}

/** 图库里的一张图 */
export interface ImageInfo {
  path: string
  name: string
  size: number
  modified: number
  /** 属于哪个项目文件夹 */
  cwd?: string
  /** 是哪个对话生成的（会话文件）。对话已经删掉、图还留着时没有 */
  session?: string
  sessionTitle?: string
  /** 生成它时的要求 */
  prompt?: string
  tool?: string
}

/** 一个装上的 Pi 包 */
export interface PackageInfo {
  /** 装的时候写的来源，比如 npm:包名、git 地址、本机路径 */
  source: string
  kind: 'npm' | 'git' | 'local'
  /** 只加载了包里挑出来的一部分 */
  filtered: boolean
}

/** 一个 MCP 服务。环境变量和请求头里可能有密钥，所以只给名字 */
/** Pi 自带的 MCP 把一个服务的工具交给模型的方式 */
export type McpExposure = 'codemode' | 'deferred' | 'direct'

/** 设置里「MCP」页需要知道的整体情况 */
/** 一个 MCP 服务现在连不连得上 */
export interface McpStatus {
  name: string
  /** connected 连上了；needs-auth 要先登录授权；disabled 没启用；error 连不上 */
  state: 'connected' | 'needs-auth' | 'disabled' | 'error'
  tools: number
  error?: string
  /** 存着这个服务的登录凭证 */
  signedIn: boolean
}

export interface McpOverview {
  servers: McpServerInfo[]
  /** 有没有装 pi-mcp-adapter 扩展。没装就只有自带的一种接法，不用选 */
  adapterInstalled: boolean
  /** 现在实际用的是哪种接法 */
  engine: 'builtin' | 'adapter'
}

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
  /** 用 Pi 自带的接法时，这个服务的工具怎么交给模型。没写就是 Pi 的默认：写脚本调用 */
  exposure: McpExposure
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
  /** 不传表示保持原样 */
  exposure?: McpExposure
}

/** 桌面端自己的设置，存在 Pi 数据目录下的 desktop/config.json */
export interface DesktopConfig {
  /** 额外的技能文件夹：里面的技能默认不启用，可以在对话里按需打开 */
  extraSkillDirs: string[]
  /** 常用模型，形如「提供商/模型」。在模型菜单里排在最前面 */
  favoriteModels: string[]
  /**
   * 新对话聊完第一轮后，让模型起个短标题。off 是不起（标题就是第一句话）；same 是用对话自己的模型；
   * 也可以写成「提供商/模型」，固定用一个便宜的模型来起。
   */
  autoTitle?: string
  /** 置顶的对话（会话 id），按侧栏里显示的顺序 */
  pinned: string[]
  /**
   * MCP 用哪种接法。builtin 是 Pi 自带的（工具用到时才找，省 token，但服务对所有对话都一样）；
   * adapter 是 pi-mcp-adapter 扩展（可以按对话开关服务，但每次对话都要带上全部工具的说明）。
   * 不设时：装了那个扩展就用它，没装就用自带的。
   */
  mcpEngine?: 'builtin' | 'adapter'
  /** 新生成的图片统一存到这个文件夹。不设就由出图的工具自己决定（一般是各项目里的 pi-images） */
  imageDir?: string
}

export interface PiApi {
  defaults(): Promise<Defaults>
  listSessions(): Promise<SessionMeta[]>
  readSession(file: string): Promise<SessionData>
  trashSession(file: string): Promise<void>
  /** 按标题、项目名和对话里的文字找对话。多个词用空格隔开，要全部出现 */
  searchSessions(query: string): Promise<SearchHit[]>
  /** 把一个对话整理成只有文字的记录（去掉工具输出和图片），返回这份记录的路径。交给别的对话或别的 AI 读 */
  sessionTranscript(file: string): Promise<string>
  /** 把一个对话移到另一个项目，返回会话文件的新位置 */
  moveSession(file: string, cwd: string): Promise<string>
  usageTotals(): Promise<UsageTotals>
  pickFolder(): Promise<string | null>
  openExternal(url: string): void
  /** 再开一个窗口 */
  newWindow(): void
  /** 把一段文字放进剪贴板 */
  clipboardText(text: string): void

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
  /** 把对话退回到第 userIndex 条用户消息之前，接下来发的消息从那里另起一条分支 */
  convRewind(key: string, userIndex: number, text: string): Promise<void>
  /** 让模型给对话起个短标题 */
  titleSuggest(model: string, question: string, answer: string): Promise<string>
  autoTitleSet(value: string): Promise<DesktopConfig>
  convSync(key: string): Promise<void>

  templatesList(cwd?: string): Promise<TemplateInfo[]>
  templateSave(input: TemplateInput): Promise<void>
  templateTrash(file: string, cwd?: string): Promise<void>
  filesSearch(cwd: string, query: string): Promise<string[]>
  /** 弹出选文件的窗口挑一张背景图。返回拷进来之后的路径，和从图里取出的代表色。取消了就什么都不返回 */
  wallpaperPick(): Promise<{ path: string; color?: string; tone?: [number, number] } | undefined>
  /** 把拖进来的一张图片当背景 */
  wallpaperUse(file: string): Promise<{ path: string; color?: string; tone?: [number, number] }>
  wallpaperClear(): Promise<void>
  /** 从一张图里取一个有代表性的颜色 */
  wallpaperColor(file: string): Promise<string | undefined>
  /** 读桌面端文件夹里的 custom.css。没有就是空的 */
  customCssRead(): Promise<string>
  /** 在访达里指出 custom.css；还没有就先建一个带说明的 */
  customCssReveal(): void
  /** 用户自己放在皮肤文件夹里的皮肤 */
  skinsList(): Promise<Skin[]>
  /** 以给的颜色为底稿新建一个皮肤文件，并在访达里指给人看 */
  skinNew(light: Palette, dark: Palette): Promise<string>
  skinsReveal(): void
  /** 看有没有更新的版本。只在用户点了之后才去问 */
  updateCheck(): Promise<UpdateInfo>
  /** 在 Pi 的包目录里找包。topic 是只看带某个关键词的，from 是从第几个开始 */
  marketSearch(query: string, topic: string, from: number): Promise<MarketPage>
  /** 读出一份 PDF 的内容，给界面把扫描件按页画成图片用 */
  pdfBytes(file: string): Promise<Uint8Array>
  /** 把 PDF、Word、PPT、Excel 里的文字提取成文本文件。模型的读文件工具读不了这些格式 */
  docText(file: string): Promise<DocText>
  /** 列出项目里一个文件夹的内容。rel 是相对项目文件夹的路径，空字符串是项目文件夹本身 */
  filesList(cwd: string, rel: string): Promise<DirListing>
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

  /** 开一个终端。同一个 id 已经开着时什么都不做 */
  termCreate(id: string, cwd: string, cols: number, rows: number): Promise<void>
  termWrite(id: string, data: string): void
  termResize(id: string, cols: number, rows: number): void
  termKill(id: string): void
  onTermData(cb: (id: string, data: string) => void): () => void
  onTermExit(cb: (id: string, code: number) => void): () => void

  changesList(cwd: string): Promise<ChangesInfo>
  /** 一个文件的改动，统一差异格式 */
  changesDiff(cwd: string, file: string): Promise<string>
  fileOpen(cwd: string, file: string): void
  fileReveal(cwd: string, file: string): void

  imagesList(): Promise<ImageInfo[]>
  /** 把这些图片移到废纸篓，返回移走了几张 */
  imagesTrash(paths: string[]): Promise<number>
  imageReveal(path: string): void
  imageCopy(path: string): Promise<void>
  imageSaveAs(path: string): Promise<string | undefined>
  /** 弹出选文件夹窗口，定下新图片统一存到哪 */
  imageDirPick(): Promise<DesktopConfig>
  /** 不再统一存放，交回给出图工具自己决定 */
  imageDirClear(): Promise<DesktopConfig>

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

  mcpList(): Promise<McpOverview>
  /** 换 MCP 的接法 */
  mcpEngineSet(engine: 'builtin' | 'adapter'): Promise<McpOverview>
  /** 挨个连一遍，看每个服务连不连得上、要不要登录。要几秒 */
  mcpStatus(): Promise<McpStatus[]>
  /** 登录一个要授权的远程服务：会打开浏览器，等你在网页上同意。过程里的提示通过 onMcpLine 送来 */
  mcpLogin(name: string): Promise<void>
  mcpLogout(name: string): Promise<void>
  onMcpLine(cb: (line: string) => void): () => void
  mcpSave(input: McpServerInput): Promise<void>
  mcpRemove(name: string): Promise<void>

  /** 改一项的简介；传空字符串是恢复成它自带的说明 */
  summarySet(id: string, summary: string): Promise<void>

  configGet(): Promise<DesktopConfig>
  /** 弹出选文件夹窗口，把选中的文件夹加进额外技能文件夹 */
  skillDirAdd(): Promise<DesktopConfig>
  skillDirRemove(dir: string): Promise<DesktopConfig>
  favoriteModelsSet(models: string[]): Promise<DesktopConfig>
  pinnedSet(ids: string[]): Promise<DesktopConfig>

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
