import fs from 'node:fs'
import path from 'node:path'
import { type Lang, resolveLang, setLang, t } from '@shared/i18n'
import { pathToFileURL } from 'node:url'
import { BrowserWindow, Menu, type MenuItemConstructorOptions, type WebContents, app, clipboard, dialog, ipcMain, nativeTheme, net, protocol, screen, shell } from 'electron'
import type { AuthType, CapSnapshot, CapState, ConvEvent, CustomProviderInput, Defaults, ImageAttachment, McpServerInput, OpenTarget, TemplateInput, Theme } from '@shared/types'
import * as accounts from './accounts'
import { AgentManager } from './agents'
import { cleanRunDir, forget, getGlobal, getItems, rekey, resetSession, saveAs, setGlobal, setStates } from './caps'
import { DESKTOP_EXT_DIR, MCP_CONFIG, forgetAllProbes, forgetProbe, setSummary } from './catalog'
import { getConfig, setConfig } from './config'
import { extractDoc, pdfBytes } from './docs'
import { searchMarket } from './market'
import { suggestTitle } from './titles'
import { checkUpdate } from './update'
import { listSkins, newSkin, readCustomCss, revealCustomCss, revealSkins } from './skins'
import { clearWallpaper, dominantColor, pickWallpaper, useWallpaper } from './wallpaper'
import { customizeGuide, openTarget, readButtons, revealButtons, watchDesktopFiles, writeButtons } from './buttons'
import type { Palette } from '@shared/skins'
import { listDir, searchFiles } from './files'
import { fileDiff, listChanges, openFile, revealFile } from './changes'
import { IMAGE_EXT, copyImage, listImages, revealImage, saveImageAs, trashImages } from './images'
import { mcpLogin, mcpLogout, mcpOverview, mcpStatus, preferDeferred, removeMcp, saveMcp } from './mcp'
import { installPackage, listPackages, removePackage } from './packages'
import { generateSummaries, itemsWithoutSummary } from './summarize'
import { buildMenu } from './menu'
import { listTemplates, saveTemplate, trashTemplate } from './templates'
import { createTerminal, killAllTerminals, killTerminal, resizeTerminal, writeTerminal } from './terminal'
import { setTrust, trustStatus } from './trust'
import { AGENT_DIR, DESKTOP_DIR, HOME, piVersion, readJson, shellEnv, writeJson } from './env'
import { listSessions, moveSession, readSession, searchSessions, usageTotals, writeTranscript } from './sessions'

/** 最近用过的那个窗口。可以开好几个窗口；弹系统对话框、响应菜单都找它 */
let win: BrowserWindow | undefined

/** 把一件事发给所有窗口。每个窗口自己只认它开着的对话 */
function broadcast(channel: string, ...args: unknown[]): void {
  for (const each of BrowserWindow.getAllWindows()) if (!each.isDestroyed()) each.webContents.send(channel, ...args)
}

// 调试用：窗口被挡住时也继续渲染，这样不用把窗口抢到前台就能截图检查
const DEBUG_RENDER = process.env.PI_DESKTOP_DEBUG === '1'
if (DEBUG_RENDER) {
  app.commandLine.appendSwitch('disable-features', 'MacWebContentsOcclusion')
  // 调试实例用自己的数据目录，这样能和平时开着的那个同时运行，互不抢界面设置
  app.setPath('userData', `${app.getPath('userData')} Debug`)
}

// 界面要显示本机的图片（生成的图、图库的缩略图），但它不能直接读文件。
// 给它一个只能取图片的地址：pi-img://local/<完整路径>
protocol.registerSchemesAsPrivileged([{ scheme: 'pi-img', privileges: { secure: true, stream: true } }])

// 平时只开一个。再启动一次时不开第二个窗口，而是把已有的带到前面：
// 两个实例会抢同一份界面设置，还会互相清掉对方给 Pi 准备的临时文件
const PRIMARY = DEBUG_RENDER || app.requestSingleInstanceLock()
if (!PRIMARY) app.quit()

function focusWindow(): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  app.focus({ steal: true })
}
app.on('second-instance', focusWindow)

const agents = new AgentManager((key: string, event: ConvEvent) => broadcast('conv:event', key, event))

/**
 * 右键菜单。Electron 默认什么都不弹：输入框里不能右键粘贴，选中的字不能右键复制。
 * 这里按点到的东西给出该有的那几项；界面自己做了右键菜单的地方（比如侧栏的对话）不会走到这里。
 */
function attachContextMenu(contents: WebContents): void {
  contents.on('context-menu', (_event, params) => {
    const items: MenuItemConstructorOptions[] = []
    if (params.isEditable) {
      items.push(
        { role: 'cut', label: t('剪切'), enabled: params.editFlags.canCut },
        { role: 'copy', label: t('复制'), enabled: params.editFlags.canCopy },
        { role: 'paste', label: t('粘贴'), enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', label: t('全选') }
      )
    } else if (params.selectionText.trim()) {
      items.push({ role: 'copy', label: t('复制') })
    }
    if (/^https?:/i.test(params.linkURL)) {
      if (items.length) items.push({ type: 'separator' })
      items.push(
        { label: t('复制链接'), click: () => clipboard.writeText(params.linkURL) },
        { label: t('用系统浏览器打开'), click: () => void shell.openExternal(params.linkURL) }
      )
    }
    if (params.mediaType === 'image') {
      if (items.length) items.push({ type: 'separator' })
      items.push({ label: t('复制图片'), click: () => contents.copyImageAt(params.x, params.y) })
    }
    if (process.env.PI_DESKTOP_DEBUG === '1') console.log('[pi-desktop] context menu:', items.map((item) => item.label ?? item.type).join(' | '))
    if (items.length) Menu.buildFromTemplate(items).popup()
  })
}

/** 窗口上次的位置和大小 */
const windowStateFile = (): string => path.join(app.getPath('userData'), 'window.json')

function savedBounds(): { x?: number; y?: number; width: number; height: number } {
  const fallback = { width: 1240, height: 820 }
  const saved = readJson<{ x?: number; y?: number; width?: number; height?: number }>(windowStateFile(), {})
  if (typeof saved.width !== 'number' || typeof saved.height !== 'number' || typeof saved.x !== 'number' || typeof saved.y !== 'number') return fallback
  // 上次那块屏幕可能已经拔掉了：窗口要是大半不在任何一块屏幕里，就回到默认位置
  const area = screen.getDisplayMatching({ x: saved.x, y: saved.y, width: saved.width, height: saved.height }).workArea
  const visibleWidth = Math.min(saved.x + saved.width, area.x + area.width) - Math.max(saved.x, area.x)
  const visibleHeight = Math.min(saved.y + saved.height, area.y + area.height) - Math.max(saved.y, area.y)
  if (visibleWidth < 200 || visibleHeight < 120) return fallback
  return { x: saved.x, y: saved.y, width: Math.max(760, saved.width), height: Math.max(520, saved.height) }
}

function createWindow(): void {
  // 已经有窗口时再开一个：和上一个错开一点，别正好盖住
  const beside = win && !win.isDestroyed() ? win.getBounds() : undefined
  const created = new BrowserWindow({
    ...(beside ? { x: beside.x + 28, y: beside.y + 28, width: beside.width, height: beside.height } : savedBounds()),
    minWidth: 760,
    minHeight: 520,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1b1c' : '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      // 右侧面板的内置浏览器用
      webviewTag: true,
      backgroundThrottling: !DEBUG_RENDER
    }
  })
  created.once('ready-to-show', () => created.show())
  win = created
  created.on('focus', () => (win = created))
  created.on('closed', () => {
    if (win === created) win = BrowserWindow.getAllWindows().find((other) => !other.isDestroyed())
  })
  attachContextMenu(created.webContents)
  // 记住窗口的位置和大小，下次打开还在原处。全屏和最大化时的尺寸不记
  let saving: ReturnType<typeof setTimeout> | undefined
  const remember = (): void => {
    clearTimeout(saving)
    saving = setTimeout(() => {
      if (created.isDestroyed() || created.isFullScreen() || created.isMaximized() || created.isMinimized()) return
      try {
        writeJson(windowStateFile(), created.getBounds())
      } catch {
        // 记不下来不影响使用
      }
    }, 400)
  }
  created.on('resize', remember)
  created.on('move', remember)
  // 内置浏览器里的网页是外人写的：不给它任何本机能力，也只让它打开普通网址
  created.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    if (!/^(https?:|about:blank)/i.test(params.src)) event.preventDefault()
  })
  created.webContents.on('did-attach-webview', (_event, guest) => {
    attachContextMenu(guest)
    // 网页想开新窗口时，就在原地打开；不是普通网址的一律不理
    guest.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) setImmediate(() => void guest.loadURL(url).catch(() => {}))
      return { action: 'deny' }
    })
    guest.on('will-navigate', (event, url) => {
      if (!/^https?:/i.test(url)) event.preventDefault()
    })
  })
  created.webContents.on('render-process-gone', (_event, details) => console.error('[pi-desktop] renderer process gone:', details.reason))
  created.webContents.on('did-fail-load', (_event, code, description, url) => console.error('[pi-desktop] page failed to load:', code, description, url))
  created.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.error('[renderer]', event.message)
  })
  // 对话里的链接一律交给系统浏览器，应用窗口本身不跳转
  created.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  created.webContents.on('will-navigate', (event, url) => {
    if (url !== created.webContents.getURL()) {
      event.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) void created.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void created.loadFile(path.join(__dirname, '../renderer/index.html'))
}

async function snapshot(key: string, cwd: string, items = getItems(agents.capsKey(key), cwd)): Promise<CapSnapshot> {
  return { items: await items, dirty: await agents.isDirty(key) }
}

function registerIpc(): void {
  const handle = (channel: string, fn: (...args: any[]) => unknown) => ipcMain.handle(channel, (_event, ...args) => fn(...args))

  handle('defaults', (): Defaults => {
    const settings = readJson<Record<string, any>>(path.join(AGENT_DIR, 'settings.json'), {})
    return {
      home: HOME,
      defaultModel: settings.defaultModel,
      defaultProvider: settings.defaultProvider,
      defaultThinkingLevel: settings.defaultThinkingLevel,
      autoCompaction: settings.compaction?.enabled !== false,
      piVersion: piVersion(),
      appVersion: app.getVersion(),
      agentDir: AGENT_DIR,
      desktopDir: DESKTOP_DIR
    }
  })
  // 账号变了以后，让闲着的 Pi 进程下次用时重启，这样模型列表才会更新
  const afterAccountChange = async (work: Promise<void>) => {
    await work
    agents.restartIdle()
  }
  handle('providers', () => accounts.listProviders())
  handle('auth:login', (provider: string, type: AuthType) =>
    afterAccountChange(
      accounts.login(provider, type, (event) => {
        broadcast('auth:event', event)
      })
    )
  )
  ipcMain.on('auth:answer', (_event, id: number, value: string | null) => accounts.answer(id, value))
  ipcMain.on('auth:abort', () => accounts.abortLogin())
  handle('auth:logout', (provider: string) => afterAccountChange(accounts.logout(provider)))
  handle('auth:check', (provider: string) => accounts.checkProvider(provider))
  handle('customProvider:get', (id: string) => accounts.getCustomProvider(id))
  handle('customProvider:save', (input: CustomProviderInput) => afterAccountChange(accounts.saveCustomProvider(input)))
  handle('customProvider:remove', (id: string) => afterAccountChange(Promise.resolve(accounts.removeCustomProvider(id))))
  ipcMain.on('openPath', (_event, target: OpenTarget) => {
    const paths: Record<OpenTarget, string> = { agent: AGENT_DIR, desktop: DESKTOP_DIR, summaries: path.join(DESKTOP_DIR, 'summaries.json'), extensions: DESKTOP_EXT_DIR, mcp: MCP_CONFIG }
    if (!paths[target]) return
    if (target === 'extensions') fs.mkdirSync(DESKTOP_EXT_DIR, { recursive: true })
    if (target === 'summaries') {
      // 这个文件默认不存在；第一次打开时建一个空的，用户才有东西可改
      if (!fs.existsSync(paths.summaries)) writeJson(paths.summaries, {})
      shell.showItemInFolder(paths[target])
    } else if (target === 'mcp') {
      if (!fs.existsSync(MCP_CONFIG)) writeJson(MCP_CONFIG, { mcpServers: {} })
      shell.showItemInFolder(MCP_CONFIG)
    } else void shell.openPath(paths[target])
  })
  handle('term:create', (id: string, cwd: string, cols: number, rows: number) =>
    createTerminal(
      id,
      cwd,
      cols,
      rows,
      (data) => send('term:data', id, data),
      (code) => send('term:exit', id, code)
    )
  )
  ipcMain.on('term:write', (_event, id: string, data: string) => writeTerminal(id, data))
  ipcMain.on('term:resize', (_event, id: string, cols: number, rows: number) => resizeTerminal(id, cols, rows))
  ipcMain.on('term:kill', (_event, id: string) => killTerminal(id))
  handle('changes:list', (cwd: string) => listChanges(cwd))
  handle('changes:diff', (cwd: string, file: string) => fileDiff(cwd, file))
  ipcMain.on('file:open', (_event, cwd: string, file: string) => {
    try {
      openFile(cwd, file)
    } catch {
      // 不在项目里的文件不打开
    }
  })
  ipcMain.on('file:reveal', (_event, cwd: string, file: string) => {
    try {
      revealFile(cwd, file)
    } catch {
      // 同上
    }
  })
  handle('images:list', () => listImages())
  handle('images:trash', (files: string[]) => trashImages(files))
  ipcMain.on('images:reveal', (_event, file: string) => {
    try {
      revealImage(file)
    } catch {
      // 图已经不在了
    }
  })
  handle('images:copy', (file: string) => copyImage(file))
  handle('images:saveAs', (file: string) => saveImageAs(win!, file))
  // 存图的位置是启动 Pi 时告诉它的，所以改了以后闲着的进程要重启
  handle('config:imageDirPick', async () => {
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled) return getConfig()
    agents.restartIdle()
    return setConfig({ imageDir: result.filePaths[0] })
  })
  handle('config:imageDirClear', () => {
    agents.restartIdle()
    return setConfig({ imageDir: undefined })
  })
  // 包装上或卸掉以后，技能清单要重新问，闲着的 Pi 进程下次用时重启
  const send = broadcast
  const afterPackageChange = async (work: Promise<void>) => {
    try {
      await work
    } finally {
      forgetAllProbes()
      agents.restartIdle()
    }
  }
  handle('pkg:list', () => listPackages())
  handle('pkg:install', (source: string) => afterPackageChange(installPackage(source, (line) => send('pkg:line', line))))
  handle('pkg:remove', (source: string) => afterPackageChange(removePackage(source, (line) => send('pkg:line', line))))
  handle('summaries:missing', async () => (await itemsWithoutSummary()).length)
  handle('summaries:generate', (model: string) => generateSummaries(model, (done, total) => send('summaries:progress', done, total)))
  // MCP 服务变了以后，闲着的 Pi 进程下次用时重启才连得上新的
  handle('mcp:list', () => mcpOverview())
  handle('mcp:engine', (engine: 'builtin' | 'adapter') => {
    setConfig({ mcpEngine: engine })
    if (engine === 'builtin') preferDeferred()
    agents.restartIdle()
    return mcpOverview()
  })
  handle('mcp:status', () => mcpStatus())
  handle('mcp:login', async (name: string) => {
    await mcpLogin(String(name), (line) => send('mcp:line', line))
    agents.restartIdle()
  })
  handle('mcp:logout', async (name: string) => {
    await mcpLogout(String(name))
    agents.restartIdle()
  })
  handle('mcp:save', (input: McpServerInput) => {
    saveMcp(input)
    agents.restartIdle()
  })
  handle('mcp:remove', (name: string) => {
    removeMcp(name)
    agents.restartIdle()
  })
  handle('summary:set', (id: string, summary: string) => setSummary(id, summary))
  handle('config:get', () => getConfig())
  handle('config:skillDirAdd', async () => {
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    const config = getConfig()
    if (result.canceled || config.extraSkillDirs.includes(result.filePaths[0])) return config
    // 技能清单变了，闲着的进程下次用时重启，指令菜单里才看得到新技能
    agents.restartIdle()
    return setConfig({ extraSkillDirs: [...config.extraSkillDirs, result.filePaths[0]] })
  })
  handle('config:favoriteModels', (models: string[]) => setConfig({ favoriteModels: models }))
  handle('config:pinned', (ids: string[]) => setConfig({ pinned: [...new Set(ids.filter((id) => typeof id === 'string'))] }))
  handle('config:skillDirRemove', (dir: string) => {
    agents.restartIdle()
    return setConfig({ extraSkillDirs: getConfig().extraSkillDirs.filter((item) => item !== dir) })
  })
  ipcMain.on('setLang', (_event, lang: Lang) => {
    if (lang !== 'zh' && lang !== 'en') return
    setLang(lang)
    // 菜单栏的文字也跟着换
    buildMenu(() => win, createWindow)
  })
  ipcMain.on('setTheme', (_event, theme: Theme) => {
    if (theme === 'system' || theme === 'light' || theme === 'dark') nativeTheme.themeSource = theme
  })
  // 界面只能读、删会话目录里的会话文件
  const sessionFile = (file: string): string => {
    const resolved = path.resolve(file)
    if (!resolved.startsWith(path.join(AGENT_DIR, 'sessions') + path.sep) || !resolved.endsWith('.jsonl')) throw new Error(t('不是会话文件'))
    return resolved
  }
  handle('listSessions', () => listSessions())
  handle('readSession', (file: string) => readSession(sessionFile(file)))
  handle('trashSession', async (file: string) => {
    await shell.trashItem(sessionFile(file))
    forget(sessionFile(file))
  })
  handle('searchSessions', (query: string) => searchSessions(String(query ?? '')))
  handle('sessionTranscript', (file: string) => writeTranscript(sessionFile(file)))
  handle('moveSession', async (file: string, cwd: string) => {
    const from = sessionFile(file)
    await agents.release(from)
    const to = moveSession(from, cwd)
    rekey(from, to)
    return to
  })
  handle('usageTotals', () => usageTotals())
  handle('pickFolder', async () => {
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.on('clipboard:text', (_event, text: string) => clipboard.writeText(String(text ?? '')))
  ipcMain.on('openExternal', (_event, url: string) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
  })

  handle('conv:start', (key: string, cwd: string, sessionFile?: string) => agents.start(key, cwd, sessionFile))
  handle('conv:prompt', (key: string, text: string, images?: ImageAttachment[], behavior?: 'steer' | 'followUp') => agents.prompt(key, text, images, behavior))
  handle('conv:abort', (key: string) => agents.abort(key))
  handle('conv:clearQueue', (key: string) => agents.clearQueue(key))
  handle('conv:bash', (key: string, command: string, exclude: boolean) => agents.bash(key, command, exclude))
  handle('conv:abortBash', (key: string) => agents.abortBash(key))
  handle('conv:setAutoCompaction', (key: string, enabled: boolean) => agents.setAutoCompaction(key, enabled))
  // 点通知回到对话：把发通知的那个窗口带到前面
  ipcMain.on('window:focus', (event) => {
    win = BrowserWindow.fromWebContents(event.sender) ?? win
    focusWindow()
  })
  ipcMain.on('window:new', () => createWindow())
  handle('conv:setModel', (key: string, provider: string, id: string) => agents.setModel(key, provider, id))
  handle('conv:setThinking', (key: string, level: string) => agents.setThinking(key, level))
  handle('conv:compact', (key: string, instructions?: string) => agents.compact(key, instructions))
  handle('conv:setName', (key: string, name: string) => agents.setName(key, name))
  handle('conv:export', async (key: string) => {
    const file = await agents.exportHtml(key)
    shell.showItemInFolder(file)
    return file
  })
  handle('conv:fork', (key: string, userIndex: number, text: string) => agents.fork(key, userIndex, text))
  handle('conv:rewind', (key: string, userIndex: number, text: string) => agents.rewind(key, userIndex, text))
  handle('title:suggest', (model: string, question: string, answer: string) => suggestTitle(String(model), String(question), String(answer)))
  handle('config:autoTitle', (value: string) => setConfig({ autoTitle: String(value) }))
  handle('conv:sync', (key: string) => agents.sync(key))

  // 快捷指令变了以后，闲着的 Pi 进程下次用时重启，新的指令才认得
  handle('templates:list', (cwd?: string) => listTemplates(cwd))
  handle('templates:save', (input: TemplateInput) => {
    saveTemplate(input)
    agents.restartIdle()
  })
  handle('templates:trash', async (file: string, cwd?: string) => {
    await trashTemplate(file, cwd)
    agents.restartIdle()
  })
  handle('trust:get', (cwd: string) => trustStatus(cwd))
  handle('trust:set', async (cwd: string, decision: boolean | null) => {
    const status = await setTrust(cwd, decision)
    forgetProbe(cwd)
    agents.restartIdle()
    return status
  })
  handle('files:search', (cwd: string, query: string) => searchFiles(cwd, query))
  handle('update:check', () => checkUpdate())
  handle('wallpaper:pick', () => pickWallpaper(win && !win.isDestroyed() ? win : undefined))
  handle('wallpaper:use', (file: string) => useWallpaper(String(file)))
  handle('wallpaper:clear', () => clearWallpaper())
  handle('wallpaper:color', (file: string) => (IMAGE_EXT.test(String(file)) ? dominantColor(String(file)) : undefined))
  handle('buttons:get', () => readButtons())
  handle('buttons:set', (buttons: unknown) => writeButtons(buttons))
  ipcMain.on('buttons:reveal', () => revealButtons())
  handle('open:target', (target: string) => openTarget(String(target)))
  handle('customize:guide', () => customizeGuide())
  handle('customCss:read', () => readCustomCss())
  ipcMain.on('customCss:reveal', () => revealCustomCss())
  handle('skins:list', () => listSkins())
  handle('skins:new', (light: Palette, dark: Palette) => newSkin(light, dark))
  ipcMain.on('skins:reveal', () => revealSkins())
  handle('market:search', (query: string, topic: string, from: number) => searchMarket(String(query ?? ''), String(topic ?? ''), Number(from) || 0))
  handle('doc:text', (file: string) => extractDoc(String(file)))
  handle('doc:pdfBytes', (file: string) => pdfBytes(String(file)))
  handle('files:list', (cwd: string, rel: string) => listDir(cwd, String(rel ?? '')))
  ipcMain.on('conv:uiResponse', (_event, key: string, payload: Record<string, unknown>) => agents.uiResponse(key, payload))
  ipcMain.on('conv:close', (_event, key: string) => agents.close(key))

  handle('caps:get', (key: string, cwd: string) => snapshot(key, cwd))
  handle('caps:set', (key: string, cwd: string, changes: Record<string, CapState>) => snapshot(key, cwd, setStates(agents.capsKey(key), cwd, changes)))
  handle('caps:saveAs', (key: string, cwd: string, scope: 'project' | 'global') => snapshot(key, cwd, saveAs(agents.capsKey(key), cwd, scope)))
  handle('caps:reset', (key: string, cwd: string) => snapshot(key, cwd, resetSession(agents.capsKey(key), cwd)))
  handle('caps:globalGet', () => getGlobal())
  handle('caps:globalSet', (changes: Record<string, CapState>) => setGlobal(changes))
}

void app.whenReady().then(() => {
  if (!PRIMARY) return
  protocol.handle('pi-img', (request) => {
    const file = decodeURIComponent(new URL(request.url).pathname.slice(1))
    // 只给图片，别的文件一概不给
    if (!IMAGE_EXT.test(file)) return new Response(null, { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
  setLang(resolveLang(app.getLocale()))
  buildMenu(() => win, createWindow)
  void shellEnv()
  // 调试实例可能和正常的实例共用同一个 Pi 配置目录，不去动那边的临时文件
  if (!DEBUG_RENDER) cleanRunDir()
  registerIpc()
  // 按钮、自己写的样式、配色文件被改了（不管是谁改的），所有窗口马上重新读
  watchDesktopFiles((what) => broadcast('desktop:file', what))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let quitConfirmed = false
app.on('before-quit', (event) => {
  // 有对话还在回答时退出会把它打断，先问一句
  const busy = agents.busyCount()
  if (busy > 0 && !quitConfirmed) {
    const choice = dialog.showMessageBoxSync({
      type: 'question',
      buttons: [t('先不退出'), t('退出应用')],
      defaultId: 0,
      cancelId: 0,
      message: t('还有 {n} 个对话正在进行', { n: busy }),
      detail: t('现在退出会把它们打断。已经写进对话记录的内容不会丢，下次打开可以接着说。')
    })
    if (choice === 0) return event.preventDefault()
    quitConfirmed = true
  }
  agents.closeAll()
  killAllTerminals()
  if (PRIMARY && !DEBUG_RENDER) cleanRunDir()
})
