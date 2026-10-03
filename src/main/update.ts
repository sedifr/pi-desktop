import { app, net } from 'electron'
import { t } from '@shared/i18n'
import type { UpdateInfo } from '@shared/types'

const REPO = 'sedifr/pi-desktop'

const parts = (version: string): number[] =>
  version
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0)

/** a 比 b 新 */
function newer(a: string, b: string): boolean {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  }
  return false
}

/**
 * 看 GitHub 上有没有更新的版本。只在用户点「检查更新」时才问，不在后台自己去查。
 * 应用没有 Apple 开发者签名，系统不允许它自己替换自己，所以这里只告诉人有新版、给出下载页，不自动安装。
 */
export async function checkUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion()
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 12_000)
  try {
    const response = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { signal: abort.signal, headers: { accept: 'application/vnd.github+json', 'user-agent': 'pi-desktop' } })
    // 仓库还没公开，或者还没发布过版本
    if (response.status === 404) return { current }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const release = (await response.json()) as { tag_name?: string; html_url?: string }
    const latest = String(release.tag_name ?? '').replace(/^v/i, '')
    return { current, latest: latest || undefined, url: release.html_url, newer: Boolean(latest) && newer(latest, current) }
  } catch (error) {
    throw new Error(t('没能查到：{error}', { error: error instanceof Error ? error.message : String(error) }))
  } finally {
    clearTimeout(timer)
  }
}
