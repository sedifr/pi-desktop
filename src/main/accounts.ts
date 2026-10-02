import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app, shell } from 'electron'
import { getLang, t } from '@shared/i18n'
import type { AuthFlowEvent, AuthStatus, CustomProviderInput, ProviderInfo } from '@shared/types'
import { AGENT_DIR, nodeExecPath, readJson, shellEnv } from './env'

const MODELS_FILE = path.join(AGENT_DIR, 'models.json')
const helperPath = () => path.join(app.getAppPath(), 'resources', 'auth-helper.mjs')

/** 登录、退出、列表都交给一个用 Pi SDK 写的小脚本去做，这里只负责启动它和转发消息 */
async function runHelper(args: string[], onMessage?: (message: AuthFlowEvent) => void): Promise<{ child: ChildProcessWithoutNullStreams; done: Promise<void> }> {
  const env = { ...(await shellEnv()), ELECTRON_RUN_AS_NODE: '1', PI_DESKTOP_LANG: getLang() }
  const child = spawn(nodeExecPath(), [helperPath(), ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] })
  let buffer = ''
  let stderr = ''
  let failure: string | undefined
  let finished = false
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk
    let index: number
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      if (!line.trim()) continue
      try {
        const message = JSON.parse(line) as AuthFlowEvent
        if (message.t === 'error') failure = message.message
        if (message.t === 'done') finished = true
        onMessage?.(message)
      } catch {
        // 不是协议消息，忽略
      }
    }
  })
  child.stderr.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString('utf8')).slice(-2000)))
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', () => {
      if (finished) resolve()
      else reject(new Error(failure ?? (stderr.trim() || t('操作没有完成'))))
    })
  })
  return { child, done }
}

export async function listProviders(): Promise<ProviderInfo[]> {
  let providers: ProviderInfo[] = []
  const { done } = await runHelper(['list'], (message) => {
    if (message.t === 'list') providers = message.providers
  })
  await done
  return providers
}

export async function checkProvider(provider: string): Promise<AuthStatus> {
  let status: AuthStatus = { state: 'error', message: t('检测没有完成'), at: Date.now() }
  try {
    const { done } = await runHelper(['check', provider], (message) => {
      if (message.t === 'status') status = { state: message.state, message: message.message, model: message.model, at: Date.now() }
    })
    await done
  } catch (error) {
    status = { state: 'error', message: error instanceof Error ? error.message : String(error), at: Date.now() }
  }
  return status
}

let flow: ChildProcessWithoutNullStreams | undefined

export async function login(provider: string, type: 'oauth' | 'api_key', emit: (event: AuthFlowEvent) => void): Promise<void> {
  if (flow) throw new Error(t('已经有一个登录在进行中'))
  const { child, done } = await runHelper(['login', provider, type], (message) => {
    // 需要去浏览器里完成的步骤，直接帮用户打开
    if (message.t === 'notify' && message.event.type === 'auth_url' && message.event.url) void shell.openExternal(message.event.url)
    if (message.t === 'notify' && message.event.type === 'device_code' && message.event.verificationUri) void shell.openExternal(message.event.verificationUri)
    emit(message)
  })
  flow = child
  try {
    await done
  } finally {
    flow = undefined
  }
}

export function answer(id: number, value: string | null): void {
  flow?.stdin.write(`${JSON.stringify(value === null ? { id, cancel: true } : { id, value })}\n`)
}

export function abortLogin(): void {
  flow?.kill()
}

export async function logout(provider: string): Promise<void> {
  const { done } = await runHelper(['logout', provider])
  await done
}

type ModelsFile = { providers?: Record<string, Record<string, unknown>> }

function writeModels(data: ModelsFile): void {
  // 改之前留一份上一版，改错了可以手动换回来
  if (fs.existsSync(MODELS_FILE)) fs.copyFileSync(MODELS_FILE, `${MODELS_FILE}.bak-desktop`)
  const tmp = `${MODELS_FILE}.tmp`
  // 这个文件里可能有密钥，保持只有当前用户可读
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, MODELS_FILE)
}

/** 添加一个 OpenAI 或 Anthropic 兼容的接口，写进 Pi 的 models.json */
export async function saveCustomProvider(input: CustomProviderInput): Promise<void> {
  const id = input.id.trim()
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(t('名称只能用小写字母、数字和连字符'))
  if (!/^https?:\/\//.test(input.baseUrl.trim())) throw new Error(t('接口地址要以 http:// 或 https:// 开头'))
  const models = input.models.map((model) => model.trim()).filter(Boolean)
  if (!models.length) throw new Error(t('至少填一个模型 ID'))
  const data = readJson<ModelsFile>(MODELS_FILE, {})
  data.providers ??= {}
  if (!data.providers[id] && (await listProviders()).some((provider) => provider.id === id)) throw new Error(t('「{id}」是内置提供商的名字，换一个', { id }))
  data.providers[id] = {
    ...data.providers[id],
    api: input.api,
    baseUrl: input.baseUrl.trim(),
    // 本地服务不需要密钥，但 Pi 要求这里有值才会把模型列出来
    apiKey: input.apiKey.trim() || 'none',
    models: models.map((model) => ({ id: model }))
  }
  writeModels(data)
}

export function removeCustomProvider(id: string): void {
  const data = readJson<ModelsFile>(MODELS_FILE, {})
  if (!data.providers?.[id]) return
  delete data.providers[id]
  writeModels(data)
}
