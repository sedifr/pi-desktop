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
  usageTotals: call('usageTotals'),
  pickFolder: call('pickFolder'),
  openExternal: (url) => ipcRenderer.send('openExternal', url),

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
  convSync: call('conv:sync'),

  templatesList: call('templates:list'),
  templateSave: call('templates:save'),
  templateTrash: call('templates:trash'),
  filesSearch: call('files:search'),
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

  configGet: call('config:get'),
  skillDirAdd: call('config:skillDirAdd'),
  skillDirRemove: call('config:skillDirRemove'),
  favoriteModelsSet: call('config:favoriteModels'),

  providers: call('providers'),
  authLogin: call('auth:login'),
  authAnswer: (id, value) => ipcRenderer.send('auth:answer', id, value),
  authAbort: () => ipcRenderer.send('auth:abort'),
  authLogout: call('auth:logout'),
  authCheck: call('auth:check'),
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
