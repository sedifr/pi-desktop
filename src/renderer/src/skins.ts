import { DEFAULT_DARK, DEFAULT_LIGHT, type Palette, type Skin, skinCss } from '@shared/skins'

/**
 * 用户对外观的定制。全是可选的，什么都不填就是原样。
 * 这些只改颜色和背景，不动任何部件的结构：菜单、输入框、卡片这些各有自己的不透明底色，
 * 背景图再花也不会透到它们上面去。
 */
export interface Look {
  /** 背景图片（已经拷进桌面端自己文件夹里的那一份的路径） */
  wallpaper?: string
  /** 这张图最暗和最亮的地方各有多亮（0 到 255）。选图的时候量好的 */
  wallTone?: [number, number]
  /** 想让背景图露出多少，0.05 到 0.5。实际露多少还要看图和主题的明暗差多少，见 wallShown */
  wallShow: number
  /** 背景图模糊多少像素 */
  wallBlur: number
  /** 强调色：链接、按钮、高亮 */
  accent?: string
  /** 色调：给底色染上一点这个颜色 */
  tint?: string
  /** 色调染多重，0 到 0.2 */
  tintStrength: number
  /** 用哪个配色文件（皮肤文件夹里的），不填就是默认配色 */
  skin?: string
}

export const DEFAULT_LOOK: Look = { wallShow: 0.18, wallBlur: 0, tintStrength: 0.08 }

// ---- 颜色的小工具 ----

type Rgb = [number, number, number]

/** 认 #rgb、#rrggbb、rgb()/rgba()。认不出的返回 undefined */
export function toRgb(color: string | undefined): Rgb | undefined {
  if (!color) return undefined
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (hex) {
    const full = hex[1].length === 3 ? [...hex[1]].map((ch) => ch + ch).join('') : hex[1]
    const n = Number.parseInt(full, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(color.trim())
  return fn ? [Number(fn[1]), Number(fn[2]), Number(fn[3])] : undefined
}

const toHex = (rgb: Rgb): string => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 两个颜色的对比度，1 到 21 */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * 把一个颜色调到在某个底色上看得清为止：不够清楚就一点点往白或往黑靠。
 * 用户挑什么颜色都行，但写在界面上的字和按钮必须认得出来。
 */
export function readable(color: Rgb, on: Rgb, min: number): Rgb {
  if (contrast(color, on) >= min) return color
  const toward: Rgb = luminance(on) < 0.4 ? [255, 255, 255] : [0, 0, 0]
  let out = color
  for (let k = 0.08; k <= 1 && contrast(out, on) < min; k += 0.08) out = mix(color, toward, k)
  return out
}

/** 按用户的定制，在一版配色（浅色或深色）上算出最后用的颜色 */
function apply(base: Palette, look: Look, dark: boolean): Palette {
  const out: Palette = { ...base }
  const tint = toRgb(look.tint)
  if (tint && look.tintStrength > 0) {
    // 深色下同样的比例看起来淡，染重一点
    const k = Math.min(0.2, look.tintStrength) * (dark ? 1.5 : 1)
    for (const name of ['bg', 'bg-side', 'bg-soft']) {
      const from = toRgb(out[name])
      if (from) out[name] = toHex(mix(from, tint, k))
    }
  }
  const accent = toRgb(look.accent)
  const bg = toRgb(out.bg)
  if (accent && bg) {
    const safe = readable(accent, bg, 4)
    out.accent = toHex(safe)
    out['accent-soft'] = `rgba(${safe.map(Math.round).join(', ')}, ${dark ? 0.16 : 0.12})`
  }
  return out
}

/** 直接写在背景上的字至少要有这么高的对比度：正文、次要的字 */
const TEXT_MIN = 4.5
const TEXT2_MIN = 3
const TEXT3_MIN = 2.5

/**
 * 在一版配色下，背景图实际能露出多少。
 * 图上面盖着一层底色，露得越多底色越薄。深色主题配一张很亮的图（或者反过来），露多了字就认不出来；
 * 所以拿图里最亮、最暗的地方各试一遍，露到正文和次要的字都还认得清为止。图和主题明暗相近时不受影响。
 */
function shownOn(palette: Palette, look: Look): number {
  const wanted = Math.max(0.05, Math.min(0.5, look.wallShow))
  const bg = toRgb(palette.bg)
  const text = toRgb(palette.text)
  const text2 = toRgb(palette['text-2'])
  if (!bg || !text || !text2) return Math.min(wanted, 0.18)
  const [lo, hi] = look.wallTone ?? [0, 255]
  const fine = (show: number): boolean =>
    [lo, hi].every((gray) => {
      const under = mix(bg, [gray, gray, gray], show)
      return contrast(text, under) >= TEXT_MIN && contrast(text2, under) >= TEXT2_MIN
    })
  let show = wanted
  while (show > 0.05 && !fine(show)) show -= 0.01
  return Math.max(0.05, Math.round(show * 100) / 100)
}

/**
 * 最淡的那一档字（时间、提示）在背景图上最容易认不出来：不够清楚就往正文的颜色靠一点，够了就停。
 * 返回 undefined 表示原来的颜色就行。
 */
function faintOn(palette: Palette, look: Look, show: number): string | undefined {
  const bg = toRgb(palette.bg)
  const text = toRgb(palette.text)
  const faint = toRgb(palette['text-3'])
  if (!bg || !text || !faint) return undefined
  const unders = (look.wallTone ?? [0, 255]).map((gray) => mix(bg, [gray, gray, gray], show))
  const fine = (color: Rgb): boolean => unders.every((under) => contrast(color, under) >= TEXT3_MIN)
  if (fine(faint)) return undefined
  let out = faint
  for (let k = 0.1; k <= 1 && !fine(out); k += 0.1) out = mix(faint, text, k)
  return toHex(out)
}

const palettes = (look: Look, userSkins: Skin[]): { light: Palette; dark: Palette } => {
  const file = userSkins.find((skin) => skin.id === look.skin)
  return { light: apply({ ...DEFAULT_LIGHT, ...file?.light }, look, false), dark: apply({ ...DEFAULT_DARK, ...file?.dark }, look, true) }
}

/** 背景图在浅色、深色主题下实际各露出多少 */
export function wallShown(look: Look, userSkins: Skin[]): { light: number; dark: number } {
  const { light, dark } = palettes(look, userSkins)
  return { light: shownOn(light, look), dark: shownOn(dark, look) }
}

/** 有没有改过颜色（背景图不算，它不走配色） */
export const hasCustomColors = (look: Look): boolean => Boolean(look.accent || (look.tint && look.tintStrength > 0) || look.skin)

/**
 * 把用户的定制落到页面上。颜色写成一套叫 custom 的配色；背景图通过几个变量交给样式表。
 * userSkins 是皮肤文件夹里的配色文件。
 */
export function applyLook(look: Look, userSkins: Skin[], wallpaperUrl: (file: string) => string): void {
  const root = document.documentElement
  let style = document.getElementById('pi-skins')
  if (!style) {
    style = document.createElement('style')
    style.id = 'pi-skins'
    document.head.appendChild(style)
  }
  const { light, dark } = palettes(look, userSkins)
  const css: string[] = []
  if (hasCustomColors(look)) {
    css.push(skinCss([{ id: 'custom', name: 'custom', light, dark }]))
    root.dataset.skin = 'custom'
  } else {
    delete root.dataset.skin
  }
  if (look.wallpaper) {
    root.dataset.wallpaper = '1'
    root.style.setProperty('--wall-image', `url("${wallpaperUrl(look.wallpaper)}")`)
    // 露出多少 = 1 - 盖在图上那层底色的不透明度。浅色、深色各算各的
    const shown = { light: shownOn(light, look), dark: shownOn(dark, look) }
    root.style.setProperty('--wall-veil', String(1 - shown.light))
    root.style.setProperty('--wall-veil-dark', String(1 - shown.dark))
    root.style.setProperty('--wall-blur', `${Math.max(0, Math.min(24, look.wallBlur))}px`)
    const faint = { light: faintOn(light, look, shown.light), dark: faintOn(dark, look, shown.dark) }
    for (const scheme of ['light', 'dark'] as const) {
      if (faint[scheme]) css.push(`@media (prefers-color-scheme: ${scheme}){:root[data-wallpaper] #root{--text-3:${faint[scheme]}}}`)
    }
  } else {
    delete root.dataset.wallpaper
    root.style.removeProperty('--wall-image')
  }
  style.textContent = css.join('\n')
  // 终端的颜色是启动时从样式里读的，告诉它重新读一遍
  window.dispatchEvent(new Event('pi-look'))
}
