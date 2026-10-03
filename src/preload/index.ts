import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AuthFlowEvent, ConvEvent, MenuAction, PiApi } from '@shared/types'

const call =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args)

const api: PiApi = {
  defaults: call('defaults'),
  listSessions: call('listSessions'),
  readSession: call('readSession'),
  trashSession: call('trashSession'),
  moveSession: call('moveSession'),
  searchSessions: call('searchSessions'),
  sessionTranscript: call('sessionTranscript'),
  usageTotals: call('usageTotals'),
  pickFolder: call('pickFolder'),
  openExternal: (url) => ipcRenderer.send('openExternal', url),
  newWindow: () => ipcRenderer.send('window:new'),
  clipboardText: (text) => ipcRenderer.send('clipboard:text', text),

  convStart: call('conv:start'),
  convPrompt: call('conv:prompt'),
  convAbort: call('conv:abort'),
  convClearQueue: call('conv:clearQueue'),
  convBash: call('conv:bash'),
  convAbortBash: call('conv:abortBash'),
  convSetAutoCompaction: call('conv:setAutoCompaction'),
  focusWindow: () => ipcRenderer.send('window:focus'),
  convSetModel: call('conv:setModel'),
  convSetThinking: call('conv:setThinking'),
  convCompact: call('conv:compact'),
  convSetName: call('conv:setName'),
  convExport: call('conv:export'),
  convFork: call('conv:fork'),
  convRewind: call('conv:rewind'),
  titleSuggest: call('title:suggest'),
  autoTitleSet: call('config:autoTitle'),
  convSync: call('conv:sync'),

  templatesList: call('templates:list'),
  templateSave: call('templates:save'),
  templateTrash: call('templates:trash'),
  filesSearch: call('files:search'),
  filesList: call('files:list'),
  docText: call('doc:text'),
  marketSearch: call('market:search'),
  updateCheck: call('update:check'),
  buttonsGet: call('buttons:get'),
  buttonsSet: call('buttons:set'),
  buttonsReveal: () => ipcRenderer.send('buttons:reveal'),
  openTarget: call('open:target'),
  customizeGuide: call('customize:guide'),
  onDesktopFile: (cb) => {
    const listener = (_event: unknown, what: 'buttons' | 'css' | 'skins') => cb(what)
    ipcRenderer.on('desktop:file', listener)
    return () => ipcRenderer.removeListener('desktop:file', listener)
  },
  wallpaperPick: call('wallpaper:pick'),
  wallpaperUse: call('wallpaper:use'),
  wallpaperClear: call('wallpaper:clear'),
  wallpaperColor: call('wallpaper:color'),
  customCssRead: call('customCss:read'),
  customCssReveal: () => ipcRenderer.send('customCss:reveal'),
  skinsList: call('skins:list'),
  skinNew: call('skins:new'),
  skinsReveal: () => ipcRenderer.send('skins:reveal'),
  pdfBytes: call('doc:pdfBytes'),
  trustGet: call('trust:get'),
  trustSet: call('trust:set'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onMenu: (cb) => {
    const listener = (_event: unknown, action: MenuAction) => cb(action)
    ipcRenderer.on('menu', listener)
    return () => ipcRenderer.removeListener('menu', listener)
  },
  convUiResponse: (key, payload) => ipcRenderer.send('conv:uiResponse', key, payload),
  convClose: (key) => ipcRenderer.send('conv:close', key),

  capsGet: call('caps:get'),
  capsSet: call('caps:set'),
  capsSaveAs: call('caps:saveAs'),
  capsReset: call('caps:reset'),
  capsGlobalGet: call('caps:globalGet'),
  capsGlobalSet: call('caps:globalSet'),

  termCreate: call('term:create'),
  termWrite: (id, data) => ipcRenderer.send('term:write', id, data),
  termResize: (id, cols, rows) => ipcRenderer.send('term:resize', id, cols, rows),
  termKill: (id) => ipcRenderer.send('term:kill', id),
  onTermData: (cb) => {
    const listener = (_event: unknown, id: string, data: string) => cb(id, data)
    ipcRenderer.on('term:data', listener)
    return () => ipcRenderer.removeListener('term:data', listener)
  },
  onTermExit: (cb) => {
    const listener = (_event: unknown, id: string, code: number) => cb(id, code)
    ipcRenderer.on('term:exit', listener)
    return () => ipcRenderer.removeListener('term:exit', listener)
  },
  changesList: call('changes:list'),
  changesDiff: call('changes:diff'),
  fileOpen: (cwd, file) => ipcRenderer.send('file:open', cwd, file),
  fileReveal: (cwd, file) => ipcRenderer.send('file:reveal', cwd, file),
  imagesList: call('images:list'),
  imagesTrash: call('images:trash'),
  imageReveal: (file) => ipcRenderer.send('images:reveal', file),
  imageCopy: call('images:copy'),
  imageSaveAs: call('images:saveAs'),
  imageDirPick: call('config:imageDirPick'),
  imageDirClear: call('config:imageDirClear'),
  packagesList: call('pkg:list'),
  packageInstall: call('pkg:install'),
  packageRemove: call('pkg:remove'),
  onPackageLine: (cb) => {
    const listener = (_event: unknown, line: string) => cb(line)
    ipcRenderer.on('pkg:line', listener)
    return () => ipcRenderer.removeListener('pkg:line', listener)
  },
  onMcpLine: (cb) => {
    const listener = (_event: unknown, line: string) => cb(line)
    ipcRenderer.on('mcp:line', listener)
    return () => ipcRenderer.removeListener('mcp:line', listener)
  },
  summariesMissing: call('summaries:missing'),
  summariesGenerate: call('summaries:generate'),
  onSummaryProgress: (cb) => {
    const listener = (_event: unknown, done: number, total: number) => cb(done, total)
    ipcRenderer.on('summaries:progress', listener)
    return () => ipcRenderer.removeListener('summaries:progress', listener)
  },
  mcpList: call('mcp:list'),
  mcpEngineSet: call('mcp:engine'),
  mcpStatus: call('mcp:status'),
  mcpLogin: call('mcp:login'),
  mcpLogout: call('mcp:logout'),
  mcpSave: call('mcp:save'),
  mcpRemove: call('mcp:remove'),
  summarySet: call('summary:set'),
  configGet: call('config:get'),
  skillDirAdd: call('config:skillDirAdd'),
  skillDirRemove: call('config:skillDirRemove'),
  favoriteModelsSet: call('config:favoriteModels'),
  pinnedSet: call('config:pinned'),

  providers: call('providers'),
  authLogin: call('auth:login'),
  authAnswer: (id, value) => ipcRenderer.send('auth:answer', id, value),
  authAbort: () => ipcRenderer.send('auth:abort'),
  authLogout: call('auth:logout'),
  authCheck: call('auth:check'),
  customProviderGet: call('customProvider:get'),
  customProviderSave: call('customProvider:save'),
  customProviderRemove: call('customProvider:remove'),
  onAuthEvent: (cb) => {
    const listener = (_event: unknown, event: AuthFlowEvent) => cb(event)
    ipcRenderer.on('auth:event', listener)
    return () => ipcRenderer.removeListener('auth:event', listener)
  },
  openPath: (target) => ipcRenderer.send('openPath', target),
  setTheme: (theme) => ipcRenderer.send('setTheme', theme),
  setLang: (lang) => ipcRenderer.send('setLang', lang),

  onEvent: (cb) => {
    const listener = (_event: unknown, key: string, event: ConvEvent) => cb(key, event)
    ipcRenderer.on('conv:event', listener)
    return () => ipcRenderer.removeListener('conv:event', listener)
  }
}

contextBridge.exposeInMainWorld('pi', api)
