import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'
import { t } from '@shared/i18n'
import { DEFAULT_DARK, DEFAULT_LIGHT, type Palette, type Skin, cleanPalette } from '@shared/skins'
import { DESKTOP_DIR, readJson } from './env'

const SKIN_DIR = path.join(DESKTOP_DIR, 'skins')

/** 用户自己放在皮肤文件夹里的皮肤：一个 JSON 文件一套。读不懂的、一个颜色都没写对的跳过 */
export function listSkins(): Skin[] {
  let files: string[] = []
  try {
    files = fs.readdirSync(SKIN_DIR).filter((name) => name.endsWith('.json'))
  } catch {
    // 还没有这个文件夹
  }
  return files
    .sort()
    .map((file): Skin | undefined => {
      const raw = readJson<{ name?: unknown; light?: unknown; dark?: unknown }>(path.join(SKIN_DIR, file), {})
      const light = cleanPalette(raw.light)
      const dark = cleanPalette(raw.dark)
      if (!Object.keys(light).length && !Object.keys(dark).length) return undefined
      return {
        // 文件名可能有空格和中文，样式里用不了，换成一个固定的短编号
        id: `user-${crypto.createHash('sha1').update(file).digest('hex').slice(0, 10)}`,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : file.replace(/\.json$/, ''),
        // 只写了一版的，另一版用同样的颜色
        light: Object.keys(light).length ? light : dark,
        dark: Object.keys(dark).length ? dark : light,
        custom: true
      }
    })
    .filter((skin): skin is Skin => Boolean(skin))
}

/**
 * 新建一套自己的皮肤：以给的颜色为底稿写一个文件，在访达里指给人看。
 * 文件里每个颜色都列出来了，改哪个存哪个，回到设置里点「重新读取」就能看到。
 */
export function newSkin(light: Palette, dark: Palette): string {
  fs.mkdirSync(SKIN_DIR, { recursive: true })
  const base = t('我的皮肤')
  let file = path.join(SKIN_DIR, `${base}.json`)
  for (let n = 2; fs.existsSync(file); n++) file = path.join(SKIN_DIR, `${base} ${n}.json`)
  const content = {
    name: path.basename(file, '.json'),
    [t('说明')]: t('light 是浅色版，dark 是深色版。颜色可以写成 #rrggbb、rgb()、rgba() 或 hsl()；不认识的项和写错的颜色会被忽略。不想改的项可以删掉，会用默认皮肤的颜色。'),
    light: { ...DEFAULT_LIGHT, ...cleanPalette(light) },
    dark: { ...DEFAULT_DARK, ...cleanPalette(dark) }
  }
  fs.writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`)
  shell.showItemInFolder(file)
  return file
}

export function revealSkins(): void {
  fs.mkdirSync(SKIN_DIR, { recursive: true })
  void shell.openPath(SKIN_DIR)
}

// ---- 自己写的样式 ----

const CUSTOM_CSS = path.join(DESKTOP_DIR, 'custom.css')

/** 读 custom.css。没有就是空的；太大的不读（多半是放错了文件） */
export function readCustomCss(): string {
  try {
    return fs.statSync(CUSTOM_CSS).size > 512 * 1024 ? '' : fs.readFileSync(CUSTOM_CSS, 'utf8')
  } catch {
    return ''
  }
}

/** 在访达里指出 custom.css。还没有就先建一个，里面写明能改什么、各个部件叫什么 */
export function revealCustomCss(): void {
  ensureCustomCss()
  shell.showItemInFolder(CUSTOM_CSS)
}

/** custom.css 还没有就建一个带说明的 */
export function ensureCustomCss(): void {
  if (fs.existsSync(CUSTOM_CSS)) return
  fs.mkdirSync(DESKTOP_DIR, { recursive: true })
  fs.writeFileSync(CUSTOM_CSS, CSS_TEMPLATE)
}

const CSS_TEMPLATE = `/*
 * Pi Desktop 的自定义样式。在「设置 → 外观 → 样式文件」里打开开关后生效，存盘就能看到效果。
 * 这个文件排在自带样式的后面，写在这里的规则会盖过自带的。
 * 把界面调乱了也不要紧：菜单栏「显示 → 恢复默认外观」会把这个开关关掉。
 *
 * Custom styles for Pi Desktop. Turn them on in Settings → Appearance → Style file; changes show up as soon as you save.
 * If the interface ends up unusable, View → Reset Appearance switches this file off.
 *
 * 颜色 / colors（在 :root 里改）:
 *   --bg  --bg-side  --bg-soft  --bg-hover  --bg-active  --border  --border-strong
 *   --text  --text-2  --text-3  --accent  --accent-soft  --danger  --invert  --invert-text
 * 圆角 / corner radius:  --r-xs  --r-sm  --r-md  --r-lg  --r-xl  --r-pill
 * 字体 / fonts:  body { font-family: … }   --mono（代码和终端 / code and terminal）
 *
 * 部件 / parts:
 *   .sidebar        对话列表那一栏 / conversation list
 *   .rail           聊天区旁边那列图标 / icon column beside the chat
 *   .header         标题栏 / title bar
 *   .chat-column    对话正文 / conversation text
 *   .user-bubble    你发的消息 / your messages
 *   .turn           一轮回答 / one answer
 *   .composer       输入框 / input box
 *   .composer-strip 输入框下面那一行 / the line under the input box
 *   .pane           右侧面板 / side panel
 *   [data-part="…"] 「设置 → 布局」里能开关的每个部件 / every part that can be switched in Settings → Layout
 *   [data-slot="…"] 放自己的按钮的位置 / a place that holds your own buttons
 *   [data-button="…"] 自己加的某一个按钮（写它的 id） / one of your own buttons, by id
 */

/* 例子：把注释去掉就生效 / examples: remove the comment marks to use them */

/* :root { --r-md: 6px; --r-lg: 8px; --r-xl: 10px; }          更方的圆角 / squarer corners */
/* .chat-column { font-family: "Songti SC", serif; }          对话用宋体 / a serif face for the conversation */
/* .user-bubble { background: var(--accent-soft); }           自己的消息用强调色的浅底 / tinted bubbles */
`
