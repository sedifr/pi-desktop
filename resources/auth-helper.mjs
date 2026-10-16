// 模型账号的登录、退出和列表。由桌面端主进程作为子进程启动，用 Pi 自己的 SDK 完成，
// 这样凭证的格式、加锁和刷新逻辑都和 Pi 命令行保持一致。
//
// 用法：
//   auth-helper.mjs list
//   auth-helper.mjs login <提供商> <api_key|oauth>
//   auth-helper.mjs logout <提供商>
//   auth-helper.mjs check <提供商>
//   auth-helper.mjs refresh
//   auth-helper.mjs balances
//
// 输出是按行分隔的 JSON。login 过程中需要用户输入时发 {t:"prompt"}，
// 主进程从标准输入回一行 {id, value} 或 {id, cancel:true}。
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'

const [, , command, providerId, authType] = process.argv
const emit = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

// 这个脚本单独运行，用不了应用里的翻译表；它自己的几句话在这里按语言给出
const EN = process.env.PI_DESKTOP_LANG === 'en'
const MSG = {
  cancelled: EN ? 'Cancelled' : '已取消',
  noCredential: EN ? 'No usable credential' : '没有可用的登录凭证',
  requestFailed: EN ? 'Request failed' : '请求失败',
  timeout: EN ? 'No response within 60 seconds' : '60 秒内没有响应',
  unknownCommand: EN ? 'Unknown command: ' : '未知命令：'
}

async function list(runtime) {
  // 用环境变量里的 Key 连上的提供商（比如 GEMINI_API_KEY），要等 Pi 查一遍才算「已连接」。不联网
  await runtime.refresh({ allowNetwork: false })
  const stored = new Map((await runtime.listCredentials()).map((c) => [c.providerId, c.type]))
  const providers = runtime.getProviders().map((provider) => {
    const status = runtime.getProviderAuthStatus(provider.id)
    const methods = []
    if (provider.auth?.oauth) {
      methods.push({ type: 'oauth', name: provider.auth.oauth.name, subscription: Boolean(provider.auth.oauth.isSubscription) })
    }
    // 没有 login 的是只认环境变量或云平台凭证的提供商，没法在界面里填
    if (provider.auth?.apiKey?.login) methods.push({ type: 'api_key', name: provider.auth.apiKey.name, subscription: false })
    return {
      id: provider.id,
      name: provider.name ?? provider.id,
      models: runtime.getModels(provider.id).length,
      methods,
      // Key 写在终端配置里（比如 GEMINI_API_KEY）的，这里改不了，只能告诉用户是哪个变量
      configured: stored.get(provider.id) ?? (!status.configured ? null : status.source === 'environment' ? 'env' : 'config'),
      ...(status.source === 'environment' && /^[A-Z][A-Z0-9_]+$/.test(status.label ?? '') ? { envVar: status.label } : {})
    }
  })
  emit({ t: 'list', providers })
}

// 联网取各家最新的模型目录，存进 Pi 自己的 models-store.json（命令行也用这一份）。
// Pi 只在交互界面里做这件事，桌面端用的 RPC 模式不会做，所以由这里补上。四小时内取过的，Pi 自己会跳过
async function refresh(runtime) {
  const ids = () => runtime.getModels().map((model) => `${model.provider}/${model.id}`)
  // 先把上次存下的目录读进来，不然存着的模型每次都会被当成新出的
  await runtime.refresh({ allowNetwork: false })
  const before = new Set(ids())
  // 不指定 allowNetwork：设了 PI_OFFLINE 时 Pi 自己就不联网
  const result = await runtime.refresh({ signal: AbortSignal.timeout(30_000) })
  emit({
    t: 'refreshed',
    added: ids().filter((id) => !before.has(id)),
    errors: [...result.errors].map(([provider, error]) => ({ provider, message: String(error?.message ?? error).slice(0, 300) }))
  })
}

// 余额：查得到的给数字，查不到的只给充值或查看余额的页面。
// oauth 表示这个查法只认哪种登录（订阅登录和 API Key 走的是两套账）
const getJson = async (url, headers) => {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}
const bearer = (key) => ({ Authorization: `Bearer ${key}` })
const kimi = (base, currency) => async (key) => ({ amount: Number((await getJson(`${base}/v1/users/me/balance`, bearer(key))).data?.available_balance), currency })
const money = (value) => (value && typeof value.amount_minor === 'number' ? value.amount_minor / 10 ** (value.exponent ?? 2) : undefined)
const BALANCE = {
  deepseek: {
    link: 'https://platform.deepseek.com/top_up',
    oauth: false,
    read: async (key) => {
      const infos = (await getJson('https://api.deepseek.com/user/balance', bearer(key))).balance_infos ?? []
      const pick = infos.find((info) => info.currency === 'CNY' && Number(info.total_balance) > 0) ?? infos.find((info) => Number(info.total_balance) > 0) ?? infos[0]
      return pick ? { amount: Number(pick.total_balance), currency: pick.currency } : {}
    }
  },
  'moonshotai-cn': { link: 'https://platform.kimi.com/console/pay', oauth: false, read: kimi('https://api.moonshot.cn', 'CNY') },
  moonshotai: { link: 'https://platform.kimi.ai/console/pay', oauth: false, read: kimi('https://api.moonshot.ai', 'USD') },
  openrouter: {
    link: 'https://openrouter.ai/settings/credits',
    oauth: false,
    read: async (key) => {
      const data = (await getJson('https://openrouter.ai/api/v1/credits', bearer(key))).data ?? {}
      return { amount: Number(data.total_credits) - Number(data.total_usage), currency: 'USD' }
    }
  },
  // Claude 订阅：用的是 Claude Code 自己查用量的接口，官方没写进文档，读不到就只给链接
  anthropic: {
    link: (oauth) => (oauth ? 'https://claude.ai/settings/usage' : 'https://platform.claude.com/settings/billing'),
    oauth: true,
    read: async (token) => {
      const data = await getJson('https://api.anthropic.com/api/oauth/usage', { ...bearer(token), 'anthropic-beta': 'oauth-2025-04-20' })
      const result = { usage: { session: data.five_hour?.utilization, weekly: data.seven_day?.utilization } }
      // 另外发的额度，字段名是内部代号，只认带着剩余金额的
      result.credits = Object.values(data)
        .filter((value) => value && typeof value === 'object' && typeof value.remaining_dollars === 'number' && value.limit_dollars)
        .map((value) => ({ amount: value.remaining_dollars, currency: 'USD', until: value.resets_at?.slice(0, 10) }))
      // Pi 里的对话从「额外用量」里扣，余额看这一项
      if (!data.extra_usage?.is_enabled) result.note = 'extra_usage_off'
      else {
        const spend = data.spend ?? {}
        const left = money(spend.balance) ?? (money(spend.limit) !== undefined && money(spend.used) !== undefined ? money(spend.limit) - money(spend.used) : undefined)
        if (left !== undefined) Object.assign(result, { amount: left, currency: spend.used?.currency ?? 'USD' })
      }
      return result
    }
  },
  google: { link: 'https://aistudio.google.com/billing' },
  'openai-codex': { link: 'https://chatgpt.com/codex/settings/usage' },
  openai: { link: 'https://platform.openai.com/settings/organization/billing/overview' }
}

async function balances(runtime) {
  await runtime.refresh({ allowNetwork: false })
  const stored = new Set((await runtime.listCredentials()).map((credential) => credential.providerId))
  const connected = runtime.getProviders().filter((provider) => BALANCE[provider.id] && (stored.has(provider.id) || runtime.getProviderAuthStatus(provider.id).configured))
  const items = await Promise.all(
    connected.map(async ({ id }) => {
      const spec = BALANCE[id]
      const oauth = runtime.isUsingOAuth(id)
      const item = { provider: id, link: typeof spec.link === 'function' ? spec.link(oauth) : spec.link }
      if (!spec.read || spec.oauth !== oauth) return item
      try {
        const key = (await runtime.getAuth(id))?.auth?.apiKey
        if (key) Object.assign(item, await spec.read(key))
      } catch (error) {
        item.error = String(error instanceof Error ? error.message : error).slice(0, 200)
      }
      if (item.amount !== undefined && !Number.isFinite(item.amount)) delete item.amount
      return item
    })
  )
  emit({ t: 'balances', items })
}

async function login(runtime) {
  const abort = new AbortController()
  const waiting = new Map()
  let seq = 0
  let buffer = ''

  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      if (!line.trim()) continue
      let message
      try {
        message = JSON.parse(line)
      } catch {
        continue
      }
      if (message.abort) abort.abort()
      const waiter = waiting.get(message.id)
      if (!waiter) continue
      waiting.delete(message.id)
      if (message.cancel) waiter.reject(new Error(MSG.cancelled))
      else waiter.resolve(String(message.value ?? ''))
    }
  })
  // 主进程退出或关掉了登录窗口
  process.stdin.on('end', () => abort.abort())

  await runtime.login(providerId, authType, {
    signal: abort.signal,
    prompt(prompt) {
      const id = ++seq
      const { signal, ...rest } = prompt
      emit({ t: 'prompt', id, prompt: rest })
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject })
        // 有的步骤会被别的途径完成（比如浏览器回调先到了），这时把输入框撤掉
        signal?.addEventListener('abort', () => {
          if (!waiting.delete(id)) return
          emit({ t: 'prompt_cancel', id })
          reject(new Error(MSG.cancelled))
        })
      })
    },
    notify(event) {
      emit({ t: 'notify', event })
    }
  })
}

// 额度用完、余额不足这一类：登录本身没问题，是钱或用量不够
const QUOTA_ERROR = /out of (extra )?usage|credits are depleted|prepayment|usage limit|insufficient[ _](credit|balance|quota|funds)|credit balance|exceeded your current quota|quota exceeded|\b402\b|payment required|billing/i
const AUTH_ERROR = /\b(401|403)\b|unauthori[sz]ed|forbidden|invalidated|invalid[^.]{0,20}(api[ _-]?key|token|credential)|expired|authenticat|sign(ing)? in again|log ?in again|not logged in/i

/**
 * 真的用 Pi 发一句最短的对话，看这个提供商现在能不能用。
 * 只看本地凭证不够：令牌可能本地没过期，但已经被服务端作废了。
 * 也不能自己拼一个最小请求：有的服务按请求的样子决定记哪笔账（比如 Claude 订阅，
 * 带着 Pi 系统提示的请求算第三方应用，从「额外用量」里扣），最小请求能通过，真对话却会被拒。
 * 用最便宜的模型、不带工具、只要回一个词，花费很少。
 */
async function check(runtime) {
  const models = [...(await runtime.getAvailable(providerId))]
  if (!models.length) return emit({ t: 'status', state: 'invalid', message: MSG.noCredential })
  models.sort((a, b) => (a.cost?.input ?? 0) - (b.cost?.input ?? 0))
  const model = models[0]
  // 包的入口是 dist/index.js，命令行在它旁边
  const cli = path.join(path.dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'))), 'cli.js')
  const args = [cli, '-p', '--no-session', '--no-extensions', '--no-skills', '--no-context-files', '--no-prompt-templates', '--no-mcp', '--no-tools', '--thinking', 'off', '--model', `${model.provider}/${model.id}`, 'Reply with the single word ok.']
  const { code, output, timedOut } = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: process.env.HOME, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let timedOut = false
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
      // 收到退出信号却迟迟不走的，几秒后强行结束
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
    }, 60_000)
    child.on('error', (error) => resolve({ code: -1, output: String(error), timedOut }))
    // 等输出都读完再看结果（exit 时最后一点报错可能还没读到）
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, output, timedOut })
    })
  })
  if (code === 0 && !timedOut) return emit({ t: 'status', state: 'ok', model: model.id })
  if (timedOut) return emit({ t: 'status', state: 'error', message: MSG.timeout, model: model.id })
  // 给人看的是最后一行（报错一般在那里）；判断是哪类问题看整段输出，前面那些和这次无关的提醒除外
  const lines = output.trim().split('\n').filter((line) => line.trim() && !/^Warning:/.test(line))
  const failure = (lines.at(-1) ?? '').trim() || MSG.requestFailed
  const all = lines.join('\n')
  const state = QUOTA_ERROR.test(all) ? 'quota' : AUTH_ERROR.test(all) ? 'invalid' : 'error'
  emit({ t: 'status', state, message: failure.slice(0, 300), model: model.id })
}

try {
  // 不在创建时刷新：列表和登录都不需要先联网，也避免无关账号的令牌被动刷新
  const runtime = await ModelRuntime.create({ refreshOnCreate: false })
  if (command === 'list') await list(runtime)
  else if (command === 'login') await login(runtime)
  else if (command === 'logout') await runtime.logout(providerId)
  else if (command === 'check') await check(runtime)
  else if (command === 'refresh') await refresh(runtime)
  else if (command === 'balances') await balances(runtime)
  else throw new Error(MSG.unknownCommand + command)
  emit({ t: 'done' })
  process.exit(0)
} catch (error) {
  emit({ t: 'error', message: error instanceof Error ? error.message : String(error) })
  process.exit(1)
}
