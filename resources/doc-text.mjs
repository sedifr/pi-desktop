// 把一份 PDF 里的文字提取出来，写成一个文本文件。由桌面端主进程作为子进程启动：
// 大文件解析起来慢，放在子进程里不会卡住界面，出了问题也不会带垮应用。
//
// 用法：doc-text.mjs <输入的 PDF> <输出的文本文件> <显示用的文件名>
// 成功时在标准输出打一行 JSON：{ pages, chars, emptyPages }；失败时打 { error }。
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const [, , input, output, shownName] = process.argv
const EN = process.env.PI_DESKTOP_LANG === 'en'
const MSG = {
  intro: (pages) => (EN ? `Text extracted from a PDF by Pi Desktop, ${pages} page(s). Original file: ${input}` : `由 Pi Desktop 从 PDF 里提取的文字，共 ${pages} 页。原文件：${input}`),
  page: (n) => (EN ? `Page ${n}` : `第 ${n} 页`),
  empty: EN ? '(no text on this page; it may be a scanned image)' : '（这一页没有文字，可能是扫描的图片）',
  password: EN ? 'This PDF is password-protected' : '这份 PDF 有密码，打不开',
  broken: EN ? 'This PDF could not be read: ' : '这份 PDF 读不出来：'
}
const emit = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

// 有些 PDF 里的常用字存的是「部首」那一套编码（看着一样，其实是另一个字符），搜索和模型都会认错。
// 康熙部首用 Unicode 自带的兼容转换就能还原；「部首补充」那一段没有，照 Unicode 的对照表换。
const RADICAL_FROM = '⺁⺂⺃⺄⺅⺆⺈⺉⺊⺋⺌⺍⺎⺏⺐⺒⺓⺔⺖⺗⺘⺙⺛⺜⺝⺞⺟⺠⺡⺢⺣⺤⺥⺦⺧⺨⺩⺫⺬⺭⺯⺰⺱⺲⺳⺴⺶⺹⺺⺻⺼⺾⺿⻀⻁⻂⻃⻄⻅⻆⻈⻉⻋⻌⻍⻎⻏⻐⻑⻒⻓⻔⻖⻗⻘⻙⻚⻛⻜⻝⻟⻠⻢⻣⻤⻥⻦⻧⻨⻩⻪⻫⻬⻭⻮⻯⻰⻱⻲⻳'
const RADICAL_TO = '厂乛乚乙亻冂刀刂卜㔾小小兀尣尢巳幺彑忄心扌攵旡日月歺母民氵氺灬爫爫丬牛犭王目示礻糹纟罓罒㓁冗羊耂肀聿肉艹艹艹虎衤覀西见角讠贝车辶辶辶邑钅長镸长门阝雨青韦页风飞食飠饣马骨鬼鱼鸟卤麦黄黾斉齐歯齿竜龙龜亀龟'
const plain = (text) =>
  text.replace(/[\u2E80-\u2EF3\u2F00-\u2FD5]/g, (ch) => {
    const at = RADICAL_FROM.indexOf(ch)
    return at >= 0 ? [...RADICAL_TO][[...RADICAL_FROM].indexOf(ch)] : ch.normalize('NFKC')
  })

try {
  const require = createRequire(import.meta.url)
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'))
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await getDocument({
    data: new Uint8Array(fs.readFileSync(input)),
    // 中日韩文字要靠这些对照表才能还原成正常的字
    cMapUrl: `${path.join(root, 'cmaps')}/`,
    cMapPacked: true,
    standardFontDataUrl: `${path.join(root, 'standard_fonts')}/`,
    verbosity: 0
  }).promise
  const out = [`# ${shownName || path.basename(input)}`, '', MSG.intro(doc.numPages), '']
  let chars = 0
  let emptyPages = 0
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number)
    const content = await page.getTextContent()
    let text = ''
    for (const item of content.items) {
      if (typeof item.str !== 'string') continue
      text += item.str
      if (item.hasEOL) text += '\n'
    }
    text = plain(text).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    chars += text.length
    if (!text) emptyPages++
    out.push(`## ${MSG.page(number)}`, '', text || MSG.empty, '')
    page.cleanup()
  }
  fs.writeFileSync(output, out.join('\n'))
  emit({ pages: doc.numPages, chars, emptyPages })
  process.exit(0)
} catch (error) {
  emit({ error: error?.name === 'PasswordException' ? MSG.password : MSG.broken + (error?.message ?? String(error)) })
  process.exit(1)
}
