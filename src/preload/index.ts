import { contextBridge, ipcRenderer } from 'electron'
import type { AuthFlowEvent, ConvEvent, PiApi } from '@shared/types'

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
  convSetModel: call('conv:setModel'),
  convSetThinking: call('conv:setThinking'),
  convCompact: call('conv:compact'),
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
