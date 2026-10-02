import fs from 'node:fs'
import path from 'node:path'
import { type Lang, resolveLang, setLang, t } from '@shared/i18n'
import { BrowserWindow, app, dialog, ipcMain, nativeTheme, shell } from 'electron'
import type { AuthType, CapSnapshot, CapState, ConvEvent, CustomProviderInput, Defaults, ImageAttachment, OpenTarget, TemplateInput, Theme } from '@shared/types'
import * as accounts from './accounts'
import { AgentManager } from './agents'
import { cleanRunDir, forget, getGlobal, getItems, resetSession, saveAs, setGlobal, setStates } from './caps'
import { DESKTOP_EXT_DIR, forgetProbe } from './catalog'
import { getConfig, setConfig } from './config'
import { searchFiles } from './files'
import { buildMenu } from './menu'
import { listTemplates, saveTemplate, trashTemplate } from './templates'
import { setTrust, trustStatus } from './trust'
import { AGENT_DIR, DESKTOP_DIR, HOME, piVersion, readJson, shellEnv, writeJson } from './env'
import { listSessions, readSession, usageTotals } from './sessions'

let win: BrowserWindow | undefined

// 调试用：窗口被挡住时也继续渲染，这样不用把窗口抢到前台就能截图检查
const DEBUG_RENDER = process.env.PI_DESKTOP_DEBUG === '1'
if (DEBUG_RENDER) app.commandLine.appendSwitch('disable-features', 'MacWebContentsOcclusion')

const agents = new AgentManager((key: string, event: ConvEvent) => {
  if (win && !win.isDestroyed()) win.webContents.send('conv:event', key, event)
})

function createWindow(): void {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
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
      backgroundThrottling: !DEBUG_RENDER
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.on('render-process-gone', (_event, details) => console.error('[pi-desktop] renderer process gone:', details.reason))
  win.webContents.on('did-fail-load', (_event, code, description, url) => console.error('[pi-desktop] page failed to load:', code, description, url))
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.error('[renderer]', event.message)
  })
  // 对话里的链接一律交给系统浏览器，应用窗口本身不跳转
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win?.webContents.getURL()) {
      event.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
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
        if (win && !win.isDestroyed()) win.webContents.send('auth:event', event)
      })
    )
  )
  ipcMain.on('auth:answer', (_event, id: number, value: string | null) => accounts.answer(id, value))
  ipcMain.on('auth:abort', () => accounts.abortLogin())
  handle('auth:logout', (provider: string) => afterAccountChange(accounts.logout(provider)))
  handle('auth:check', (provider: string) => accounts.checkProvider(provider))
  handle('customProvider:save', (input: CustomProviderInput) => afterAccountChange(accounts.saveCustomProvider(input)))
  handle('customProvider:remove', (id: string) => afterAccountChange(Promise.resolve(accounts.removeCustomProvider(id))))
  ipcMain.on('openPath', (_event, target: OpenTarget) => {
    const paths: Record<OpenTarget, string> = { agent: AGENT_DIR, desktop: DESKTOP_DIR, summaries: path.join(DESKTOP_DIR, 'summaries.json'), extensions: DESKTOP_EXT_DIR }
    if (!paths[target]) return
    if (target === 'extensions') fs.mkdirSync(DESKTOP_EXT_DIR, { recursive: true })
    if (target === 'summaries') {
      // 这个文件默认不存在；第一次打开时建一个空的，用户才有东西可改
      if (!fs.existsSync(paths.summaries)) writeJson(paths.summaries, {})
      shell.showItemInFolder(paths[target])
    } else void shell.openPath(paths[target])
  })
  handle('config:get', () => getConfig())
  handle('config:skillDirAdd', async () => {
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    const config = getConfig()
    if (result.canceled || config.extraSkillDirs.includes(result.filePaths[0])) return config
    return setConfig({ extraSkillDirs: [...config.extraSkillDirs, result.filePaths[0]] })
  })
  handle('config:favoriteModels', (models: string[]) => setConfig({ favoriteModels: models }))
  handle('config:skillDirRemove', (dir: string) => setConfig({ extraSkillDirs: getConfig().extraSkillDirs.filter((item) => item !== dir) }))
  ipcMain.on('setLang', (_event, lang: Lang) => {
    if (lang !== 'zh' && lang !== 'en') return
    setLang(lang)
    // 菜单栏的文字也跟着换
    buildMenu(() => win)
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
  handle('usageTotals', () => usageTotals())
  handle('pickFolder', async () => {
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
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
  ipcMain.on('window:focus', () => {
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    app.focus({ steal: true })
  })
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
  setLang(resolveLang(app.getLocale()))
  buildMenu(() => win)
  void shellEnv()
  cleanRunDir()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  agents.closeAll()
  cleanRunDir()
})
