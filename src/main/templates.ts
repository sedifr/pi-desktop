import fs from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'
import YAML from 'yaml'
import { t } from '@shared/i18n'
import type { TemplateInfo, TemplateInput } from '@shared/types'
import { AGENT_DIR } from './env'

/**
 * 快捷指令就是 Pi 的「提示词模板」：prompts 文件夹里的一个 Markdown 文件，
 * 文件名就是 `/` 后面的命令名。全局的放在 Pi 数据目录下，项目的放在项目的 .pi/prompts 里。
 */
const globalDir = () => path.join(AGENT_DIR, 'prompts')
const projectDir = (cwd: string) => path.join(cwd, '.pi', 'prompts')

function readDir(dir: string, scope: TemplateInfo['scope']): TemplateInfo[] {
  let names: string[] = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const out: TemplateInfo[] = []
  for (const name of names.sort()) {
    if (!name.endsWith('.md')) continue
    const file = path.join(dir, name)
    try {
      const source = fs.readFileSync(file, 'utf8')
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source)
      const meta = match ? (YAML.parse(match[1]) ?? {}) : {}
      out.push({
        name: name.slice(0, -3),
        scope,
        file,
        description: typeof meta.description === 'string' ? meta.description : '',
        argumentHint: typeof meta['argument-hint'] === 'string' ? meta['argument-hint'] : '',
        body: match ? source.slice(match[0].length) : source
      })
    } catch {
      // 读不了的文件跳过
    }
  }
  return out
}

export function listTemplates(cwd?: string): TemplateInfo[] {
  return [...readDir(globalDir(), 'global'), ...(cwd ? readDir(projectDir(cwd), 'project') : [])]
}

export function saveTemplate(input: TemplateInput): void {
  const name = input.name.trim().replace(/^\//, '')
  if (!name || /[\s/\\:]/.test(name)) throw new Error(t('指令名不能为空，也不能包含空格、斜杠或冒号'))
  if (input.scope === 'project' && !input.cwd) throw new Error(t('没有打开的项目，不能保存成项目指令'))
  const dir = input.scope === 'project' ? projectDir(input.cwd!) : globalDir()
  const file = path.join(dir, `${name}.md`)
  // 改名或换范围时，新位置已经有同名文件就不覆盖
  if (input.originalFile !== file && fs.existsSync(file)) throw new Error(t('已经有一条叫 /{name} 的指令了', { name }))

  const meta: Record<string, string> = {}
  if (input.description.trim()) meta.description = input.description.trim()
  if (input.argumentHint.trim()) meta['argument-hint'] = input.argumentHint.trim()
  const front = Object.keys(meta).length ? `---\n${YAML.stringify(meta).trimEnd()}\n---\n` : ''
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, `${front}${input.body.replace(/\s+$/, '')}\n`)
  if (input.originalFile && input.originalFile !== file && isTemplateFile(input.originalFile, input.cwd)) fs.rmSync(input.originalFile, { force: true })
}

function isTemplateFile(file: string, cwd?: string): boolean {
  const resolved = path.resolve(file)
  const dirs = [globalDir(), ...(cwd ? [projectDir(cwd)] : [])]
  return resolved.endsWith('.md') && dirs.some((dir) => path.dirname(resolved) === path.resolve(dir))
}

export async function trashTemplate(file: string, cwd?: string): Promise<void> {
  if (!isTemplateFile(file, cwd)) throw new Error(t('不是快捷指令文件'))
  await shell.trashItem(path.resolve(file))
}
