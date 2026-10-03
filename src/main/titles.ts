import { spawn } from 'node:child_process'
import { t } from '@shared/i18n'
import { HOME, cleanEnvPath, nodeExecPath, piCliPath, shellEnv } from './env'

/**
 * 让模型给一个新对话起个短标题。只把第一句问话和回答的开头发过去，
 * 不带工具、技能、扩展，系统提示词也换成一句话，所以每次只花一两百个 token。
 */
export function suggestTitle(model: string, question: string, answer: string): Promise<string> {
  const system = t('你只做一件事：给一段对话起标题。只输出标题本身，不加引号、标点和任何解释。')
  const ask = [
    t('给下面这段对话起一个标题：不超过 16 个字，说清楚在做什么事，用和用户一样的语言。'),
    '',
    `${t('用户')}: ${question.slice(0, 1200)}`,
    '',
    `AI: ${answer.slice(0, 600)}`
  ].join('\n')
  return new Promise((resolve, reject) => {
    void shellEnv().then((base) => {
      const args = ['-r', cleanEnvPath(), piCliPath(), '--print', '--no-session', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-tools', '--thinking', 'off', '--system-prompt', system, '--model', model, ask]
      const child = spawn(nodeExecPath(), args, { cwd: HOME, env: { ...base, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      let err = ''
      const timer = setTimeout(() => child.kill(), 45_000)
      child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')))
      child.stderr.on('data', (chunk: Buffer) => (err = (err + chunk.toString('utf8')).slice(-800)))
      child.on('error', reject)
      child.on('exit', (code) => {
        clearTimeout(timer)
        // 只取第一行，去掉模型爱加的引号、书名号和句末标点
        const title = (out.trim().split('\n')[0] ?? '')
          .replace(/^["'“「『《\s]+|["'”」』》。.\s]+$/g, '')
          .replace(/\s+/g, ' ')
          .slice(0, 40)
        if (code === 0 && title) resolve(title)
        else reject(new Error(err.trim() || t('模型没有返回内容')))
      })
    }, reject)
  })
}
