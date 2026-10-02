// 模型账号的登录、退出和列表。由桌面端主进程作为子进程启动，用 Pi 自己的 SDK 完成，
// 这样凭证的格式、加锁和刷新逻辑都和 Pi 命令行保持一致。
//
// 用法：
//   auth-helper.mjs list
//   auth-helper.mjs login <提供商> <api_key|oauth>
//   auth-helper.mjs logout <提供商>
//   auth-helper.mjs check <提供商>
//
// 输出是按行分隔的 JSON。login 过程中需要用户输入时发 {t:"prompt"}，
// 主进程从标准输入回一行 {id, value} 或 {id, cancel:true}。
import { ModelRuntime } from '@earendil-works/pi-coding-agent'

const [, , command, providerId, authType] = process.argv
const emit = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

async function list(runtime) {
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
      configured: stored.get(provider.id) ?? (status.configured ? 'config' : null)
    }
  })
  emit({ t: 'list', providers })
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
      if (message.cancel) waiter.reject(new Error('已取消'))
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
          reject(new Error('已取消'))
        })
      })
    },
    notify(event) {
      emit({ t: 'notify', event })
    }
  })
}

const AUTH_ERROR = /\b(401|403)\b|unauthori[sz]ed|forbidden|invalidated|invalid[^.]{0,20}(api[ _-]?key|token|credential)|expired|authenticat|sign(ing)? in again|log ?in again|not logged in/i

/**
 * 真的发一个最小的请求，看这个提供商的登录现在还能不能用。
 * 只看本地凭证不够：令牌可能本地没过期，但已经被服务端作废了。
 * 一收到服务端的正常响应就立刻中断，基本不产生费用。
 */
async function check(runtime) {
  const models = [...(await runtime.getAvailable(providerId))]
  if (!models.length) return emit({ t: 'status', state: 'invalid', message: '没有可用的登录凭证' })
  models.sort((a, b) => (a.cost?.input ?? 0) - (b.cost?.input ?? 0))
  const model = models[0]
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 30_000)
  let ok = false
  let failure
  try {
    const stream = runtime.streamSimple(
      model,
      { messages: [{ role: 'user', content: 'ping', timestamp: Date.now() }] },
      {
        signal: abort.signal,
        onResponse: (response) => {
          if ((response?.status ?? 200) < 400) {
            ok = true
            abort.abort()
          }
        }
      }
    )
    for await (const event of stream) {
      if (ok) break
      if (event.type === 'error') {
        failure = event.error?.errorMessage ?? '请求失败'
        break
      }
      if (event.type !== 'start') {
        ok = true
        abort.abort()
        break
      }
    }
  } catch (error) {
    if (!ok) failure = error instanceof Error ? error.message : String(error)
  }
  clearTimeout(timer)
  if (ok) return emit({ t: 'status', state: 'ok', model: model.id })
  failure ??= '30 秒内没有响应'
  emit({ t: 'status', state: AUTH_ERROR.test(failure) ? 'invalid' : 'error', message: failure.slice(0, 300), model: model.id })
}

try {
  // 不在创建时刷新：列表和登录都不需要先联网，也避免无关账号的令牌被动刷新
  const runtime = await ModelRuntime.create({ refreshOnCreate: false })
  if (command === 'list') await list(runtime)
  else if (command === 'login') await login(runtime)
  else if (command === 'logout') await runtime.logout(providerId)
  else if (command === 'check') await check(runtime)
  else throw new Error(`未知命令：${command}`)
  emit({ t: 'done' })
  process.exit(0)
} catch (error) {
  emit({ t: 'error', message: error instanceof Error ? error.message : String(error) })
  process.exit(1)
}
