/**
 * 皮肤：一套颜色。只管界面长什么样，和 Pi 内核没有关系。
 * 每套皮肤有浅色、深色两版；跟着「主题」那个设置（跟随系统 / 浅色 / 深色）用其中一版。
 */
export interface Skin {
  id: string
  name: string
  light: Palette
  dark: Palette
  /** 用户自己放在皮肤文件夹里的 */
  custom?: boolean
}

export type Palette = Record<string, string>

/** 皮肤能改的颜色。名字和样式表里的变量一一对应（前面加两道横线） */
export const SKIN_VARS = [
  'bg', // 主区域的底色
  'bg-side', // 侧栏的底色
  'bg-soft', // 卡片、气泡、代码块的底色
  'bg-hover', // 鼠标移上去
  'bg-active', // 选中
  'border',
  'border-strong',
  'text', // 正文
  'text-2', // 次要的字
  'text-3', // 更淡的字
  'accent', // 强调色：链接、按钮、高亮
  'accent-soft', // 强调色的浅底
  'danger',
  'danger-soft',
  'invert', // 反色按钮的底（发送按钮）
  'invert-text',
  'code-keyword',
  'code-string',
  'code-number',
  'code-title',
  'code-type'
] as const

/** 默认皮肤的颜色。和 styles.css 开头那两段保持一致；新建自己的皮肤时拿它当底稿 */
export const DEFAULT_LIGHT: Palette = {
  bg: '#ffffff',
  'bg-side': '#f6f6f7',
  'bg-soft': '#f3f3f4',
  'bg-hover': 'rgba(0, 0, 0, 0.05)',
  'bg-active': 'rgba(0, 0, 0, 0.08)',
  border: 'rgba(0, 0, 0, 0.1)',
  'border-strong': 'rgba(0, 0, 0, 0.18)',
  text: '#1a1a1a',
  'text-2': '#5d5d60',
  'text-3': '#8e8e93',
  accent: '#2563eb',
  'accent-soft': 'rgba(37, 99, 235, 0.1)',
  danger: '#c0392b',
  'danger-soft': 'rgba(192, 57, 43, 0.08)',
  invert: '#1a1a1a',
  'invert-text': '#ffffff',
  'code-keyword': '#a626a4',
  'code-string': '#3a8a3a',
  'code-number': '#b76b01',
  'code-title': '#2d6fd6',
  'code-type': '#0f7b8a'
}

export const DEFAULT_DARK: Palette = {
  bg: '#1b1b1c',
  'bg-side': '#141415',
  'bg-soft': '#262628',
  'bg-hover': 'rgba(255, 255, 255, 0.06)',
  'bg-active': 'rgba(255, 255, 255, 0.1)',
  border: 'rgba(255, 255, 255, 0.1)',
  'border-strong': 'rgba(255, 255, 255, 0.2)',
  text: '#ececec',
  'text-2': '#a8a8ad',
  'text-3': '#77777c',
  accent: '#7aa7ff',
  'accent-soft': 'rgba(122, 167, 255, 0.14)',
  danger: '#ff7b6b',
  'danger-soft': 'rgba(255, 123, 107, 0.1)',
  invert: '#ececec',
  'invert-text': '#1b1b1c',
  'code-keyword': '#c792ea',
  'code-string': '#a5d6a0',
  'code-number': '#f0b866',
  'code-title': '#82aaff',
  'code-type': '#6fd0dc'
}

/** 只认颜色的几种写法。皮肤文件是别人也可能给的，不能让它往样式里塞别的东西 */
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/a-z]+\))$/i

/** 从皮肤文件里的一段挑出认识的、写法正确的颜色。键名带不带前面的两道横线都行 */
export function cleanPalette(raw: unknown): Palette {
  const out: Palette = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.replace(/^--/, '')
    if ((SKIN_VARS as readonly string[]).includes(name) && typeof value === 'string' && COLOR.test(value.trim())) out[name] = value.trim()
  }
  return out
}

const block = (palette: Palette): string =>
  Object.entries(palette)
    .map(([name, value]) => `--${name}:${value};`)
    .join('')

/** 把一组皮肤写成样式。选中哪套由 <html data-skin="…"> 决定；深色那一段要排在浅色后面才盖得住 */
export function skinCss(skins: Skin[]): string {
  return skins
    .filter((skin) => /^[\w-]+$/.test(skin.id))
    .map((skin) => {
      const at = `:root[data-skin="${skin.id}"]`
      return `${at}{${block(skin.light)}}@media (prefers-color-scheme: dark){${at}{${block(skin.dark)}}}`
    })
    .join('\n')
}
