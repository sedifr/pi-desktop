import { type BrowserWindow, Menu, type MenuItemConstructorOptions, app } from 'electron'
import { t } from '@shared/i18n'
import type { MenuAction } from '@shared/types'

/** 系统菜单栏。快捷键都挂在这里，这样在菜单里能看到，也符合 macOS 的习惯 */
export function buildMenu(getWindow: () => BrowserWindow | undefined): void {
  const send = (action: MenuAction) => () => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return
    win.show()
    win.webContents.send('menu', action)
  }
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: t('设置…'), accelerator: 'Cmd+,', click: send('settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: t('文件'),
      submenu: [
        { label: t('新对话'), accelerator: 'Cmd+N', click: send('new') },
        { label: t('添加项目文件夹…'), accelerator: 'Cmd+O', click: send('addProject') },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    { role: 'editMenu' },
    {
      label: t('对话'),
      submenu: [
        { label: t('停止'), accelerator: 'Cmd+.', click: send('stop') },
        { type: 'separator' },
        { label: t('快捷指令'), accelerator: 'Cmd+/', click: send('commands') },
        { label: t('切换模型'), accelerator: 'Cmd+Shift+M', click: send('model') },
        { type: 'separator' },
        { label: t('改名…'), click: send('rename') },
        { label: t('复制上一条回答'), accelerator: 'Cmd+Shift+C', click: send('copyLast') },
        { label: t('压缩上下文'), click: send('compact') },
        { label: t('导出为网页'), click: send('export') }
      ]
    },
    {
      label: t('显示'),
      submenu: [
        { label: t('显示或隐藏侧栏'), accelerator: 'Cmd+B', click: send('toggleSidebar') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : ([{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[]))
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
