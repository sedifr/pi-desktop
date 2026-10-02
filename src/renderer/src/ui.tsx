import { createContext, memo, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { t } from '@shared/i18n'

const ICONS: Record<string, ReactNode> = {
  plus: <path d="M8 3v10M3 8h10" />,
  edit: <path d="M3 13h2.5l7-7-2.5-2.5-7 7V13zM9.5 4.5l2.5 2.5" />,
  folder: <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7z" />,
  right: <path d="M6 3.5 10.5 8 6 12.5" />,
  left: <path d="M10 3.5 5.5 8 10 12.5" />,
  down: <path d="M3.5 6 8 10.5 12.5 6" />,
  up: <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />,
  stop: <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" />,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M6.8 7v3.5M9.2 7v3.5" />,
  check: <path d="M3 8.5 6.5 12 13 4.5" />,
  sliders: <path d="M2.5 5h4M9.5 5h4M2.5 11h6M11.5 11h2M8 3.5v3M10 9.5v3" />,
  terminal: <path d="M2.5 3.5h11v9h-11zM5 6.5 7 8.5 5 10.5M8.5 10.5H11" />,
  file: <path d="M4 2.5h5L12 5.5v8H4zM9 2.5v3h3" />,
  search: <path d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM11 11l3 3" />,
  image: <path d="M2.5 3.5h11v9h-11zM2.5 10.5l3-3 2.5 2.5 2-2 3.5 3.5M10.2 6.2a.6.6 0 1 0 0-.01" />,
  star: <path d="M8 2.2l1.75 3.6 3.95.55-2.86 2.77.68 3.93L8 11.2l-3.52 1.85.68-3.93L2.3 6.35l3.95-.55L8 2.2z" />,
  chart: <path d="M8 2a6 6 0 1 0 6 6H8V2zM10.5 2.6A6 6 0 0 1 13.4 5.5h-2.9V2.6z" />,
  tool: <path d="M10.5 2.5a3 3 0 0 0-2.9 3.9L2.5 11.5l2 2 5.1-5.1a3 3 0 0 0 3.9-2.9l-2 1-1.5-1.5 1-2c-.2 0-.3-.5-.5-.5z" />,
  brain: <path d="M8 3.5a2.5 2.5 0 0 0-4.5 1.6A2.5 2.5 0 0 0 3 9.5 2.5 2.5 0 0 0 8 11m0-7.5a2.5 2.5 0 0 1 4.5 1.6 2.5 2.5 0 0 1 .5 4.4A2.5 2.5 0 0 1 8 11m0-7.5V13" />,
  refresh: <path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3" />,
  shield: <path d="M8 2 12.5 3.8v3.6c0 2.9-1.9 5-4.5 6.1-2.6-1.1-4.5-3.2-4.5-6.1V3.8z" />,
  slash: <path d="M3 2.5h10v11H3zM9.5 5l-3 6" />,
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="3.5" cy="8" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="12.5" cy="8" r="1.2" />
    </g>
  ),
  copy: <path d="M5.5 5.5h7v8h-7zM3.5 10.5v-8h7" />,
  branch: <path d="M4.5 3.5v9M4.5 8c0-2.5 7-1 7-4.5M4.5 3.5a1 1 0 1 0 0-.01M4.5 12.5a1 1 0 1 0 0-.01M11.5 3.5a1 1 0 1 0 0-.01" />,
  sidebar: <path d="M2.5 3.5h11v9h-11zM6 3.5v9" />,
  spark: <path d="M7 2.5 8.2 6 11.5 7.2 8.2 8.4 7 12 5.8 8.4 2.5 7.2 5.8 6zM12.2 10.6v2.8M10.8 12h2.8" />,
  plug: <path d="M6 2.5v3M10 2.5v3M4.5 5.5h7V8a3.5 3.5 0 0 1-7 0zM8 11.5v2" />,
  gear: (
    <g transform="scale(0.6667)" strokeWidth="1.9">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </g>
  )
}

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

/** 界面不能直接读本机文件，图片走主进程给的这个地址 */
export const imgUrl = (file: string): string => `pi-img://local/${encodeURIComponent(file)}`

/**
 * 正文里的图片需要知道的两件事：相对路径是相对哪个项目文件夹；
 * 哪些图在上面已经显示过了（模型常常在回答里把刚生成的图再写一遍，不用显示两次）；
 * 以及点了图片之后做什么。
 */
export const ImageContext = createContext<{ cwd?: string; home?: string; shown?: Set<string>; open?: (file: string) => void }>({})

/** 把正文里写的图片地址换成本机的完整路径。不是本机文件就返回 undefined */
function localPath(src: string, cwd?: string, home?: string): string | undefined {
  let value = src
  try {
    value = decodeURIComponent(src)
  } catch {
    // 本来就不是转义过的
  }
  if (value.startsWith('file://')) return value.slice(7)
  if (value.startsWith('/')) return value
  if (value.startsWith('~/')) return home ? `${home}${value.slice(1)}` : undefined
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || !cwd) return undefined
  return `${cwd}/${value.replace(/^\.\//, '')}`
}

function MdImage({ src, alt }: { src?: string; alt?: string }) {
  const { cwd, home, shown, open } = useContext(ImageContext)
  const [failed, setFailed] = useState(false)
  if (!src) return null
  if (/^data:image\//.test(src)) return <img src={src} alt={alt} />
  // 网上的图片不自动加载（一加载就等于告诉对方你看了什么），给一个链接自己点
  if (/^https?:/i.test(src)) {
    return (
      <a href={src} target="_blank" rel="noreferrer">
        {alt || src}
      </a>
    )
  }
  const file = localPath(src, cwd, home)
  if (!file || shown?.has(file)) return null
  if (failed) return <span className="img-missing">{t('这张图片不在了：{path}', { path: src })}</span>
  return <img className="md-image" src={imgUrl(file)} alt={alt} onError={() => setFailed(true)} onClick={() => open?.(file)} />
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // 图片地址自己处理（见 MdImage），不让默认规则把 file:// 之类的滤掉；链接仍按默认规则
        urlTransform={(url, key) => (key === 'src' ? url : defaultUrlTransform(url))}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          img: ({ src, alt }) => <MdImage src={typeof src === 'string' ? src : undefined} alt={alt} />
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})

/** 点到外面或按 Esc 时关闭的浮层 */
export function Popover({ onClose, className, group, children }: { onClose: () => void; className?: string; group?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return
      // 点的是同一组里的触发按钮：不在这里关，让按钮自己的点击去切换。
      // 否则这里先关掉，按钮的点击又把它打开，看起来就是「再点一次收不起来」。
      const trigger = (event.target as Element).closest?.('[data-popover-trigger]')
      if (group && trigger?.getAttribute('data-popover-trigger') === group) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    // 等这次点击结束再监听，不然打开它的那一下点击会立刻把它关掉
    const timer = setTimeout(() => document.addEventListener('mousedown', onDown))
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div ref={ref} className={`popover ${className ?? ''}`} data-popover-group={group}>
      {children}
    </div>
  )
}

export type DotState = 'ok' | 'invalid' | 'error' | 'checking' | 'none' | 'off'

/** 登录状态的小圆点：绿 可用，红 失效，黄 没检测成，灰色闪动 检测中，空心 未检测或未连接 */
export function StatusDot({ state, title }: { state: DotState; title?: string }) {
  return <span className={`dot ${state}`} title={title} />
}

export function fmtTokens(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return String(n)
}

export function fmtCost(n: number | undefined): string {
  if (!n) return '$0'
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}

export function relTime(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60_000)
  if (min < 1) return t('刚刚')
  if (min < 60) return t('{n} 分钟前', { n: min })
  const hours = Math.floor(min / 60)
  if (hours < 24) return t('{n} 小时前', { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return t('{n} 天前', { n: days })
  return t('{n} 个月前', { n: Math.floor(days / 30) })
}

export const baseName = (p: string): string => p.split('/').filter(Boolean).pop() ?? p
