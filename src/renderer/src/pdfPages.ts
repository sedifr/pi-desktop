import type { ImageAttachment } from '@shared/types'
import { api } from './store'

/** 扫描件最多转前几页。每页都是一张图，太多了模型吃不下，对话记录也会很大 */
export const MAX_SCAN_PAGES = 8
const PAGE_WIDTH = 1400

/**
 * 把一份 PDF 的前几页画成图片。扫描件里没有文字可以提取，只能让会看图的模型直接看。
 * pdf.js 用到的时候才加载，平时不占启动时间。
 */
export async function renderPdfPages(file: string): Promise<{ images: ImageAttachment[]; total: number }> {
  const [pdfjs, worker, bytes] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'), api.pdfBytes(file)])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: bytes })
  const doc = await task.promise
  const images: ImageAttachment[] = []
  const base = (file.split('/').pop() ?? 'file').replace(/\.pdf$/i, '')
  try {
    for (let number = 1; number <= Math.min(doc.numPages, MAX_SCAN_PAGES); number++) {
      const page = await doc.getPage(number)
      const natural = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(3, PAGE_WIDTH / natural.width) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: context, viewport }).promise
      images.push({ name: `${base}-${number}.jpg`, mimeType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] })
      page.cleanup()
    }
    return { images, total: doc.numPages }
  } finally {
    void task.destroy()
  }
}
