// 检查翻译有没有漏：源码里每个 t('中文') 都要在 src/shared/locales/en.ts 里有对应的英文。
// 用法：npm run i18n:check
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../src')
const files = []
;(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(name) && !full.includes('locales') && !full.endsWith('i18n.ts')) files.push(full)
  }
})(root)

const unescape = (text) => text.replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
const cjk = /[一-鿿]/
const used = new Set()
const unwrapped = []
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) used.add(unescape(match[1]))
  // 没包进 t() 的中文（注释除外）也算漏
  const code = source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
  code.split('\n').forEach((line, index) => {
    const bare = line
      .replace(/^\s*\/\/.*$/, '')
      .replace(/(?<![:'"`])\/\/\s.*$/, '')
      .replace(/\bt\(\s*'(?:[^'\\]|\\.)*'/g, 't(X')
      // 表里的中文在用的时候才翻译，写成 label: '…' / summary: '…'，这里放行，下面单独核对
      .replace(/\b(label|summary):\s*'(?:[^'\\]|\\.)*'/g, (entry) => {
        const text = /'((?:[^'\\]|\\.)*)'/.exec(entry)[1]
        if (cjk.test(text)) used.add(unescape(text))
        return 'X'
      })
    if (cjk.test(bare)) unwrapped.push(`${path.relative(root, file)}:${index + 1}: ${line.trim().slice(0, 120)}`)
  })
}

const dictionary = fs.readFileSync(path.join(root, 'shared/locales/en.ts'), 'utf8')
const translated = new Set([...dictionary.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((match) => unescape(match[1])))
const missing = [...used].filter((key) => cjk.test(key) && !translated.has(key))
const unused = [...translated].filter((key) => !used.has(key))

for (const line of unwrapped) console.log(`没有接入翻译：${line}`)
for (const key of missing) console.log(`缺英文：${JSON.stringify(key)}`)
for (const key of unused) console.log(`用不到了：${JSON.stringify(key)}`)
console.log(`共 ${used.size} 句，缺 ${missing.length} 句，没接入 ${unwrapped.length} 处，多余 ${unused.length} 句`)
process.exit(missing.length || unwrapped.length ? 1 : 0)
