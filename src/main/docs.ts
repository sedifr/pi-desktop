import { execFile, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { getLang, t } from '@shared/i18n'
import type { DocText } from '@shared/types'
import { DESKTOP_DIR, nodeExecPath } from './env'

const OUT_DIR = path.join(DESKTOP_DIR, 'attachments')
/** macOS 自带的 textutil 能直接转成文字的格式 */
const TEXTUTIL = new Set(['.doc', '.docx', '.rtf', '.rtfd', '.odt', '.webarchive'])
const MAX_CHARS = 2_000_000
const MAX_ROWS = 3000

/** 这类文件模型的读文件工具读不了（读出来是乱码），要先提取出文字 */
export const DOC_EXTENSIONS = ['.pdf', ...TEXTUTIL, '.pptx', '.xlsx']

const run = (command: string, args: string[], timeout = 60_000): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 256 * 1024 * 1024, timeout, encoding: 'utf8' }, (error, stdout) => (error ? reject(error) : resolve(stdout)))
  })

const unxml = (text: string): string =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')

/** 压缩包（pptx、xlsx 本质上都是）里有哪些文件 */
const zipNames = async (file: string): Promise<string[]> => (await run('/usr/bin/unzip', ['-Z1', file])).split('\n').filter(Boolean)
const zipRead = (file: string, entry: string): Promise<string> => run('/usr/bin/unzip', ['-p', file, entry])
const byNumber = (a: string, b: string): number => Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0)

/** PDF：交给子进程里的 pdf.js。大文件解析慢，不能卡住主进程 */
function pdfText(file: string, output: string, name: string): Promise<{ pages: number; chars: number; emptyPages: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeExecPath(), [path.join(app.getAppPath(), 'resources', 'doc-text.mjs'), file, output, name], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PI_DESKTOP_LANG: getLang() },
      stdio: ['ignore', 'pipe', 'ignore']
    })
    let out = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => (out += chunk))
    child.on('error', (error) => reject(error))
    child.on('close', () => {
      clearTimeout(timer)
      try {
        const result = JSON.parse(out.trim().split('\n').pop() ?? '')
        if (result.error) reject(new Error(result.error))
        else resolve(result)
      } catch {
        reject(new Error(t('这份 PDF 太大或者读不出来')))
      }
    })
  })
}

/** PPT：每页幻灯片里的文字，一段一行 */
async function pptxText(file: string): Promise<{ text: string; pages: number }> {
  const slides = (await zipNames(file)).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(byNumber)
  const out: string[] = []
  for (const [index, slide] of slides.entries()) {
    const xml = await zipRead(file, slide)
    const lines = [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)]
      .map((paragraph) => [...paragraph[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((run_) => unxml(run_[1])).join(''))
      .filter((line) => line.trim())
    out.push(`## ${t('第 {n} 页', { n: index + 1 })}`, '', lines.join('\n') || t('（这一页没有文字）'), '')
  }
  return { text: out.join('\n'), pages: slides.length }
}

/** Excel：每张表按行列出来，单元格之间用制表符隔开。公式取的是文件里存着的计算结果 */
async function xlsxText(file: string): Promise<{ text: string; pages: number }> {
  const names = await zipNames(file)
  const shared = names.includes('xl/sharedStrings.xml')
    ? [...(await zipRead(file, 'xl/sharedStrings.xml')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((item) =>
        [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => unxml(part[1])).join('')
      )
    : []
  const titles = names.includes('xl/workbook.xml') ? [...(await zipRead(file, 'xl/workbook.xml')).matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((sheet) => unxml(sheet[1])) : []
  const sheets = names.filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort(byNumber)
  const column = (ref: string): number => [...(/^[A-Z]+/.exec(ref)?.[0] ?? 'A')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
  const out: string[] = []
  for (const [index, sheet] of sheets.entries()) {
    const xml = await zipRead(file, sheet)
    const rows = [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)]
    out.push(`## ${titles[index] ?? t('第 {n} 张表', { n: index + 1 })}`, '')
    for (const row of rows.slice(0, MAX_ROWS)) {
      const cells: string[] = []
      for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const type = /\bt="([^"]*)"/.exec(cell[1])?.[1]
        const body = cell[2] ?? ''
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ''
        const value =
          type === 's' ? (shared[Number(raw)] ?? '') : type === 'inlineStr' ? [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => unxml(part[1])).join('') : unxml(raw)
        cells[column(/\br="([^"]*)"/.exec(cell[1])?.[1] ?? '')] = value.replace(/[\t\n]+/g, ' ')
      }
      out.push(Array.from(cells, (value) => value ?? '').join('\t'))
    }
    if (rows.length > MAX_ROWS) out.push(t('（后面还有 {n} 行没列出来）', { n: rows.length - MAX_ROWS }))
    out.push('')
  }
  return { text: out.join('\n'), pages: sheets.length }
}

/**
 * 把一份文档（PDF、Word、PPT、Excel）里的文字提取出来，存成一个文本文件，返回它在哪。
 * 模型的读文件工具只认文字和图片，直接读这些文件只会读到乱码还白费 token；
 * 提取之后它想读多少读多少，不用装任何别的工具，只读权限下也能用。
 */
export async function extractDoc(file: string): Promise<DocText> {
  const source = path.resolve(file)
  const stat = fs.statSync(source)
  if (!stat.isFile()) throw new Error(t('这不是一个文件'))
  const ext = path.extname(source).toLowerCase()
  if (!DOC_EXTENSIONS.includes(ext)) throw new Error(t('不认识这种文件'))
  const name = path.basename(source)
  // 文件名只留文字和数字；文件变了（大小或修改时间）就另存一份
  const safe = path
    .basename(source, path.extname(source))
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .slice(0, 32)
    .replace(/^-+|-+$/g, '')
  const hash = crypto.createHash('sha1').update(`${source}|${stat.size}|${stat.mtimeMs}`).digest('hex').slice(0, 8)
  const output = path.join(OUT_DIR, `${safe || 'file'}-${hash}.md`)
  fs.mkdirSync(OUT_DIR, { recursive: true })

  if (ext === '.pdf') {
    const result = await pdfText(source, output, name)
    // 平均每页不到二十个字：基本就是扫描件，没有文字层
    return { path: output, source, name, kind: 'pdf', pages: result.pages, chars: result.chars, scanned: result.chars < result.pages * 20 }
  }
  let body: { text: string; pages?: number }
  let kind: DocText['kind']
  if (ext === '.pptx') [body, kind] = [await pptxText(source), 'slides']
  else if (ext === '.xlsx') [body, kind] = [await xlsxText(source), 'sheets']
  else [body, kind] = [{ text: await run('/usr/bin/textutil', ['-convert', 'txt', '-stdout', '-encoding', 'UTF-8', source]) }, 'doc']
  const text = body.text.replace(/\n{3,}/g, '\n\n').trim()
  const clipped = text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n\n${t('（后面太长，没有全部提取）')}` : text
  fs.writeFileSync(output, [`# ${name}`, '', t('由 Pi Desktop 提取的文字。原文件：{path}', { path: source }), '', clipped, ''].join('\n'))
  return { path: output, source, name, kind, pages: body.pages, chars: text.length, scanned: false }
}

/** 读出一份 PDF 的内容。界面要把扫描件按页画成图片，只给 PDF，太大的不给 */
export function pdfBytes(file: string): Uint8Array {
  const source = path.resolve(file)
  if (path.extname(source).toLowerCase() !== '.pdf') throw new Error(t('不认识这种文件'))
  if (fs.statSync(source).size > 80 * 1024 * 1024) throw new Error(t('这份 PDF 太大或者读不出来'))
  return new Uint8Array(fs.readFileSync(source))
}
