import { net } from 'electron'
import { t } from '@shared/i18n'
import type { MarketPage } from '@shared/types'

const PAGE = 24

/**
 * Pi 的包市场：npm 上带 pi-package 关键词的包，和 pi.dev/packages 列的是同一批。
 * 不输入时按下载量排（最常用的在前）；输入了就按相关程度排。
 * 这里只把搜索词发给 npm 的公开接口，不带任何别的信息。
 */
export async function searchMarket(query: string, topic: string, from: number): Promise<MarketPage> {
  const words = query.trim().slice(0, 80)
  const keyword = /^[a-z0-9-]{1,40}$/.test(topic) ? topic : ''
  const text = ['keywords:pi-package', keyword && `keywords:${keyword}`, words].filter(Boolean).join(' ')
  const params = new URLSearchParams({ text, size: String(PAGE), from: String(Math.max(0, Math.floor(from) || 0)) })
  if (!words) for (const [name, weight] of Object.entries({ popularity: '1.0', quality: '0.0', maintenance: '0.0' })) params.set(name, weight)
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 15_000)
  try {
    const response = await net.fetch(`https://registry.npmjs.org/-/v1/search?${params}`, { signal: abort.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as { total?: number; objects?: Record<string, any>[] }
    const items = (data.objects ?? []).map((entry) => {
      const pkg = entry.package ?? {}
      return {
        name: String(pkg.name ?? ''),
        version: String(pkg.version ?? ''),
        description: String(pkg.description ?? ''),
        keywords: (Array.isArray(pkg.keywords) ? pkg.keywords : []).filter((word: unknown) => typeof word === 'string' && word !== 'pi-package').slice(0, 8),
        weekly: Number(entry.downloads?.weekly ?? 0),
        updated: String(pkg.date ?? entry.updated ?? ''),
        publisher: typeof pkg.publisher?.username === 'string' ? pkg.publisher.username : undefined,
        npm: `https://www.npmjs.com/package/${pkg.name}`,
        repo: typeof pkg.links?.repository === 'string' ? pkg.links.repository.replace(/^git\+/, '').replace(/\.git$/, '') : undefined
      }
    })
    return { items: items.filter((item) => item.name), total: Number(data.total ?? items.length), more: items.length === PAGE }
  } catch (error) {
    throw new Error(t('连不上 npm 的包目录：{error}', { error: error instanceof Error ? error.message : String(error) }))
  } finally {
    clearTimeout(timer)
  }
}
