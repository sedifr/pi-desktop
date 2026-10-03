import fs from 'node:fs'
import path from 'node:path'
import { app, shell } from 'electron'
import { type UserButton, cleanButtons } from '@shared/buttons'
import { t } from '@shared/i18n'
import type { ButtonsFile } from '@shared/types'
import { DESKTOP_DIR, HOME, writeJson } from './env'
import { ensureCustomCss } from './skins'

const FILE = path.join(DESKTOP_DIR, 'buttons.json')

/** 文件里写了几个按钮（不管写得对不对） */
const countOf = (raw: unknown): number => (Array.isArray(raw) ? raw.length : Array.isArray((raw as { buttons?: unknown })?.buttons) ? (raw as { buttons: unknown[] }).buttons.length : 0)

/**
 * 读自己加的按钮。这个文件人和 Pi 都会改：读不懂、或者有几个写得不对，都要说出来，
 * 不然「加了按钮却没出现」就只能猜。
 */
export function readButtons(): ButtonsFile {
  let text: string
  try {
    text = fs.readFileSync(FILE, 'utf8')
  } catch {
    return { buttons: [], file: FILE }
  }
  if (!text.trim()) return { buttons: [], file: FILE }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return { buttons: [], file: FILE, problem: t('buttons.json 不是合法的 JSON，里面的按钮都没法显示：{error}', { error: error instanceof Error ? error.message : String(error) }) }
  }
  const buttons = cleanButtons(raw)
  const skipped = countOf(raw) - buttons.length
  return { buttons, file: FILE, ...(skipped > 0 ? { problem: t('buttons.json 里有 {n} 个按钮写得不对，被跳过了（缺名字、位置不认识，或者没写清楚按下去做什么）', { n: skipped }) } : {}) }
}

/** 把按钮写回文件。文件里的其他内容（比如说明）留着；原来的文件读不懂就不写，免得把人手写的东西盖掉 */
export function writeButtons(list: unknown): ButtonsFile {
  let existing: Record<string, unknown> = {}
  try {
    const text = fs.readFileSync(FILE, 'utf8')
    if (text.trim()) {
      const raw: unknown = JSON.parse(text)
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) existing = raw as Record<string, unknown>
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error(t('{file} 不是合法的 JSON（可能有注释、多余的逗号，或者手改时留下了错误）。为了不弄丢里面的内容，这次没有改动它。先把它改对再试。', { file: FILE }))
  }
  const note = t('自己加的按钮。排在前面的显示在前面。每一项怎么写，见同一个文件夹里的 CUSTOMIZE.md')
  writeJson(FILE, { [t('说明')]: note, ...existing, buttons: cleanButtons(list) })
  return readButtons()
}

/** 在访达里指出 buttons.json。还没有就先建一个空的 */
export function revealButtons(): void {
  if (!fs.existsSync(FILE)) writeButtons([])
  shell.showItemInFolder(FILE)
}

/** 打开一个文件或文件夹（按钮的「打开」动作）。网址由界面自己在浏览器面板里开，不走这里 */
export function openTarget(target: string): void {
  const full = target === '~' ? HOME : target.startsWith('~/') ? path.join(HOME, target.slice(2)) : target
  if (!path.isAbsolute(full)) throw new Error(t('要写完整的路径（以 / 或 ~/ 开头），或者一个 http 开头的网址'))
  if (!fs.existsSync(full)) throw new Error(t('找不到：{path}', { path: full }))
  void shell.openPath(full)
}

/**
 * 给 Pi 看的「怎么改这个界面」的说明。每次要用都从应用里重新拷一份到桌面端的文件夹，
 * 这样说明总是和当前版本对得上，Pi 也不用去应用的安装目录里找。
 * 顺手把 custom.css 建好：Pi 要改样式的时候有地方下手。
 */
export function customizeGuide(): string {
  fs.mkdirSync(DESKTOP_DIR, { recursive: true })
  const target = path.join(DESKTOP_DIR, 'CUSTOMIZE.md')
  fs.copyFileSync(path.join(app.getAppPath(), 'resources', 'customize-guide.md'), target)
  ensureCustomCss()
  return target
}

export type DesktopFile = 'buttons' | 'css' | 'skins'

/**
 * 盯着桌面端文件夹里那几个决定界面长相的文件。不管是谁改的（界面、编辑器、Pi），改完马上告诉界面重新读。
 * 这个文件夹里还有附件、对话的文字版这些经常写的东西，只挑要的那几个。
 */
export function watchDesktopFiles(onChange: (what: DesktopFile) => void): void {
  fs.mkdirSync(DESKTOP_DIR, { recursive: true })
  const timers = new Map<DesktopFile, NodeJS.Timeout>()
  const fire = (what: DesktopFile): void => {
    clearTimeout(timers.get(what))
    // 编辑器存一次文件会连着来好几个通知，攒一下只读一遍
    timers.set(
      what,
      setTimeout(() => onChange(what), 150)
    )
  }
  try {
    fs.watch(DESKTOP_DIR, { recursive: true }, (_event, name) => {
      const file = String(name ?? '')
      if (file === 'buttons.json') fire('buttons')
      else if (file === 'custom.css') fire('css')
      else if (file.startsWith(`skins${path.sep}`) && file.endsWith('.json')) fire('skins')
    })
  } catch {
    // 盯不了也不碍事：设置里每一项都有「重新读取」
  }
}
