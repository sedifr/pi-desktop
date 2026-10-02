import fs from 'node:fs'
import path from 'node:path'
import { ClipboardItem, clipboard, dialog, nativeImage, shell, type BrowserWindow } from 'electron'
import { t } from '@shared/i18n'
import type { ImageInfo } from '@shared/types'
import { getConfig } from './config'
import { listSessions, sessionImages } from './sessions'

export const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i
/** 出图工具默认把图片存在项目下的这个文件夹里 */
const PROJECT_DIR = 'pi-images'

function filesIn(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => IMAGE_EXT.test(name))
      .map((name) => path.join(dir, name))
  } catch {
    return []
  }
}

/**
 * 所有生成过的图片：对话记录里提到的，加上各个存图文件夹里实际放着的。
 * 文件已经不在的不列；文件夹里有、但找不到出处的也列出来（对话被删了，图还留着）。
 */
export function listImages(): ImageInfo[] {
  const seen = new Map<string, ImageInfo>()
  const add = (file: string, extra: Partial<ImageInfo>) => {
    let stat: fs.Stats
    try {
      stat = fs.statSync(file)
    } catch {
      return
    }
    if (!stat.isFile()) return
    const known = seen.get(file)
    // 同一张图在几个对话里都出现时，记最早生成它的那个
    if (known) return void Object.assign(known, { ...extra, ...known })
    seen.set(file, { path: file, name: path.basename(file), size: stat.size, modified: stat.mtimeMs, ...extra })
  }

  // 有过对话的项目文件夹都去看一眼它的存图文件夹：对话删了，图可能还留着
  const cwds = new Set(listSessions().map((meta) => meta.cwd).filter(Boolean))
  for (const item of sessionImages()) {
    for (const image of item.images) {
      if (IMAGE_EXT.test(image.path)) add(image.path, { cwd: item.cwd, session: item.file, sessionTitle: item.title, prompt: image.prompt, tool: image.tool })
    }
  }
  for (const cwd of cwds) for (const file of filesIn(path.join(cwd, PROJECT_DIR))) add(file, { cwd })
  const library = getConfig().imageDir
  if (library) for (const file of filesIn(library)) add(file, {})

  return [...seen.values()].sort((a, b) => b.modified - a.modified)
}

/** 界面传来的路径只有确实在图片列表里才动它 */
function known(file: string): string {
  const resolved = path.resolve(file)
  if (!IMAGE_EXT.test(resolved) || !listImages().some((image) => image.path === resolved)) throw new Error(t('这不是图库里的图片'))
  return resolved
}

export async function trashImages(files: string[]): Promise<number> {
  const list = new Set(listImages().map((image) => image.path))
  let done = 0
  for (const file of files) {
    const resolved = path.resolve(file)
    if (!list.has(resolved)) continue
    await shell.trashItem(resolved)
    done++
  }
  return done
}

export function revealImage(file: string): void {
  shell.showItemInFolder(known(file))
}

export async function copyImage(file: string): Promise<void> {
  // 统一转成 PNG 放进剪贴板，贴到哪里都认
  const png = nativeImage.createFromPath(known(file)).toPNG()
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })])
}

/** 另存一份到用户选的位置，返回存到了哪；取消时返回 undefined */
export async function saveImageAs(win: BrowserWindow, file: string): Promise<string | undefined> {
  const source = known(file)
  const result = await dialog.showSaveDialog(win, { defaultPath: path.basename(source) })
  if (result.canceled || !result.filePath) return undefined
  fs.copyFileSync(source, result.filePath)
  return result.filePath
}
