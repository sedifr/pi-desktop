import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { type BrowserWindow, dialog, nativeImage } from 'electron'
import { t } from '@shared/i18n'
import { DESKTOP_DIR } from './env'

export interface Wallpaper {
  path: string
  /** 图里有代表性的颜色 */
  color?: string
  /** 图里最暗和最亮的地方各有多亮（0 到 255 的灰度）。界面靠它算这张图最多能露多少字还认得清 */
  tone?: [number, number]
}

const WALL_DIR = path.join(DESKTOP_DIR, 'wallpaper')
const EXT = /\.(png|jpe?g|webp|gif)$/i

/**
 * 让用户挑一张图当背景。图会拷一份到桌面端自己的文件夹里：原图以后挪走、删掉都不影响。
 * 之前拷进来的旧图顺手清掉，这个文件夹里始终只有一张。
 */
export async function pickWallpaper(win: BrowserWindow | undefined): Promise<Wallpaper | undefined> {
  const options = { title: t('选一张图片当背景'), properties: ['openFile' as const], filters: [{ name: t('图片'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const source = result.filePaths[0]
  if (result.canceled || !source) return undefined
  return useWallpaper(source)
}

export function useWallpaper(source: string): Wallpaper {
  if (!EXT.test(source)) throw new Error(t('这不是能当背景的图片（支持 png、jpg、webp、gif）'))
  const stat = fs.statSync(source)
  if (stat.size > 40 * 1024 * 1024) throw new Error(t('这张图太大了（超过 40 MB），换一张小一点的'))
  fs.mkdirSync(WALL_DIR, { recursive: true })
  const name = `wallpaper-${crypto.createHash('sha1').update(`${source}|${stat.size}|${stat.mtimeMs}`).digest('hex').slice(0, 10)}${path.extname(source).toLowerCase()}`
  const target = path.join(WALL_DIR, name)
  if (path.resolve(source) !== target) fs.copyFileSync(source, target)
  for (const old of fs.readdirSync(WALL_DIR)) if (old !== name && old.startsWith('wallpaper-')) fs.rmSync(path.join(WALL_DIR, old), { force: true })
  return { path: target, color: dominantColor(target), tone: imageTone(target) }
}

/** 不用背景图了：把桌面端自己拷的那一份删掉（原图不动） */
export function clearWallpaper(): void {
  try {
    for (const old of fs.readdirSync(WALL_DIR)) if (old.startsWith('wallpaper-')) fs.rmSync(path.join(WALL_DIR, old), { force: true })
  } catch {
    // 本来就没有
  }
}

/**
 * 从图片里取一个有代表性的颜色，给强调色和色调用。
 * 把图缩得很小，按色相分成十二份；每个点按「鲜艳、不过亮也不过暗」加权，取分量最重的那一份的平均色。
 * 整张图都是灰的就取不出来。
 */
export function dominantColor(file: string): string | undefined {
  const image = nativeImage.createFromPath(file)
  if (image.isEmpty()) return undefined
  const small = image.resize({ width: 48, quality: 'good' })
  const { width, height } = small.getSize()
  const pixels = small.toBitmap()
  const buckets = Array.from({ length: 12 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }))
  for (let i = 0; i + 3 < width * height * 4; i += 4) {
    // 位图是 BGRA 的顺序
    const [b, g, r, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]
    if (a < 128) continue
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const light = (max + min) / 510
    const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255))
    if (saturation < 0.18 || light < 0.12 || light > 0.9) continue
    let hue = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4
    if (hue < 0) hue += 6
    const weight = saturation * (1 - Math.abs(light - 0.5))
    const bucket = buckets[Math.min(11, Math.floor(hue * 2))]
    bucket.weight += weight
    bucket.r += r * weight
    bucket.g += g * weight
    bucket.b += b * weight
  }
  const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a))
  if (best.weight <= 0) return undefined
  return `#${[best.r, best.g, best.b].map((sum) => Math.round(sum / best.weight).toString(16).padStart(2, '0')).join('')}`
}

/**
 * 这张图最暗和最亮的地方各有多亮，折成 0 到 255 的灰度。
 * 掐掉两头各 5% 的点：一两颗星星、一条黑边不该算数。
 */
export function imageTone(file: string): [number, number] | undefined {
  const image = nativeImage.createFromPath(file)
  if (image.isEmpty()) return undefined
  const small = image.resize({ width: 64, quality: 'good' })
  const { width, height } = small.getSize()
  const pixels = small.toBitmap()
  const linear = (v: number): number => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
  const counts = new Array<number>(256).fill(0)
  let total = 0
  for (let i = 0; i + 3 < width * height * 4; i += 4) {
    if (pixels[i + 3] < 128) continue
    const light = 0.0722 * linear(pixels[i]) + 0.7152 * linear(pixels[i + 1]) + 0.2126 * linear(pixels[i + 2])
    const gray = light <= 0.0031308 ? light * 12.92 : 1.055 * light ** (1 / 2.4) - 0.055
    counts[Math.max(0, Math.min(255, Math.round(gray * 255)))]++
    total++
  }
  if (!total) return undefined
  const at = (share: number): number => {
    let seen = 0
    for (let level = 0; level < 256; level++) {
      seen += counts[level]
      if (seen >= total * share) return level
    }
    return 255
  }
  return [at(0.05), at(0.95)]
}
