import { spawn } from 'node:child_process'
import { t } from '@shared/i18n'
import { type CatalogItem, hasOwnSummary, loadCatalog, setSummary } from './catalog'
import { HOME, cleanEnvPath, nodeExecPath, piCliPath, shellEnv } from './env'

/** 还没有自己写过简介的技能、MCP 和扩展。自带的四个工具不算 */
export async function itemsWithoutSummary(): Promise<CatalogItem[]> {
  const items = await loadCatalog(HOME)
  // MCP 服务没写说明时，界面上显示的是它的网址或命令，那里面可能带着密钥，不能拿去问模型
  return items.filter((item) => !/^tool:/.test(item.id) && !hasOwnSummary(item.id) && (item.kind !== 'mcp' || Boolean(item.description)))
}

const BATCH = 20

function ask(model: string, payload: string): Promise<string> {
  // 这句话是发给模型的要求；界面是什么语言，简介就让它用什么语言写
  const instruction = t('上面是一份 JSON 列表，里面是编程 Agent 的技能、MCP 服务和扩展。为每一项写一句简介：它是干什么的、什么时候用。用简体中文，不超过 28 个字，让人一眼认得出来。不要用「用于」「该技能」这类套话开头。只回复一个 JSON 对象：键是 id，值是那句简介。不要有别的文字。')
  return new Promise((resolve, reject) => {
    void shellEnv().then((base) => {
      const args = ['-r', cleanEnvPath(), piCliPath(), '--print', '--no-session', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-tools', '--model', model, instruction]
      const child = spawn(nodeExecPath(), args, { cwd: HOME, env: { ...base, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'pipe', 'pipe'] })
      let out = ''
      let err = ''
      const timer = setTimeout(() => child.kill(), 120_000)
      child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')))
      child.stderr.on('data', (chunk: Buffer) => (err = (err + chunk.toString('utf8')).slice(-1500)))
      child.on('error', reject)
      child.on('exit', (code) => {
        clearTimeout(timer)
        if (code === 0 && out.trim()) resolve(out)
        else reject(new Error(err.trim() || out.trim() || t('模型没有返回内容')))
      })
      // 进程先退出时，没写完的输入会报错；退出本身由上面的 exit 处理
      child.stdin.on('error', () => {})
      child.stdin.end(payload)
    }, reject)
  })
}

/**
 * 让模型给还没有简介的项各写一句，存进简介文件。返回写了几条。
 * 这会用掉一点模型额度，所以只在用户点了按钮之后才跑。
 */
export async function generateSummaries(model: string, onProgress: (done: number, total: number) => void): Promise<number> {
  const items = await itemsWithoutSummary()
  let written = 0
  for (let start = 0; start < items.length; start += BATCH) {
    const batch = items.slice(start, start + BATCH)
    const payload = JSON.stringify(batch.map((item) => ({ id: item.id, name: item.name, description: ((item.kind === 'mcp' ? item.description : item.description || item.summary) ?? '').slice(0, 500) })))
    const reply = await ask(model, `${payload}\n\n`)
    const body = reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(body)
    } catch {
      throw new Error(t('模型返回的内容不是预期的格式，换一个模型再试'))
    }
    const known = new Set(batch.map((item) => item.id))
    for (const [id, text] of Object.entries(parsed)) {
      if (!known.has(id) || typeof text !== 'string' || !text.trim()) continue
      setSummary(id, text.trim().replace(/\s+/g, ' ').slice(0, 120))
      written++
    }
    onProgress(Math.min(start + BATCH, items.length), items.length)
  }
  return written
}
