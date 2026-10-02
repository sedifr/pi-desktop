import { useEffect, useRef, useState, type Ref } from 'react'
import { t } from '@shared/i18n'
import { api, useApp } from './store'
import { Icon } from './ui'

/** 网页视图上用得到的那几个方法 */
interface WebviewElement extends HTMLWebViewElement {
  loadURL(url: string): Promise<void>
  getURL(): string
  getTitle(): string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
}

const LAST_URL = 'browserUrl'
// 这个属性要写成字符串才会真的落到页面上；React 的类型把它当成了布尔值
const POPUPS = { allowpopups: 'true' } as object

/** 地址栏里打的字变成要打开的地址：本机地址补 http，像域名的补 https，其余当成要搜的词 */
export function toUrl(input: string): string {
  const text = input.trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return text
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(text)) return `http://${text.replace(/^0\.0\.0\.0/, 'localhost')}`
  if (/^[^\s/]+:\d+(\/|$)/.test(text)) return `http://${text}`
  if (!/\s/.test(text) && /^[^\s/]+\.[a-z]{2,}(\/|$|:|\?)/i.test(text)) return `https://${text}`
  return `https://www.bing.com/search?q=${encodeURIComponent(text)}`
}

/**
 * 右侧面板的「浏览器」页：一个简单的内置浏览器，主要用来看本机跑起来的页面。
 * 它有自己独立的一份登录状态，和系统浏览器、和这个应用本身都不共用。
 */
export function Browser() {
  const request = useApp((s) => s.browserRequest)
  const view = useRef<WebviewElement>(null)
  // 第一个要打开的网址。网页视图直接从它开始，这样历史记录里不会垫着一张空白页（不然第一页就能「后退」到空白）
  const [first, setFirst] = useState<string>()
  const started = first !== undefined
  const [address, setAddress] = useState('')
  const [current, setCurrent] = useState('')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<string>()
  const [nav, setNav] = useState({ back: false, forward: false })
  const last = useRef(localStorage.getItem(LAST_URL) ?? '')
  // 网页视图刚放到页面上时还不能用，要等它自己说准备好了
  const ready = useRef(false)
  const wanted = useRef<string | undefined>(undefined)

  const go = (input: string) => {
    const url = toUrl(input)
    if (!url) return
    setAddress(url)
    setFailed(undefined)
    if (!started) return setFirst(url)
    if (ready.current) void view.current?.loadURL(url).catch(() => {})
    else wanted.current = url
  }

  // 对话里点了本机地址的链接，会要求在这里打开
  const requestCount = request?.n
  useEffect(() => {
    if (request) go(request.url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestCount])

  useEffect(() => {
    const el = view.current
    if (!el || !started) return
    const sync = () => {
      const url = el.getURL()
      if (url && url !== 'about:blank') {
        setCurrent(url)
        setAddress(url)
        localStorage.setItem(LAST_URL, url)
      }
      setTitle(el.getTitle())
      setNav({ back: el.canGoBack(), forward: el.canGoForward() })
    }
    const handlers: [string, (event: Event) => void][] = [
      [
        'dom-ready',
        () => {
          ready.current = true
          if (wanted.current) void el.loadURL(wanted.current).catch(() => {})
          wanted.current = undefined
        }
      ],
      ['did-start-loading', () => setLoading(true)],
      [
        'did-stop-loading',
        () => {
          setLoading(false)
          sync()
        }
      ],
      ['did-navigate', sync],
      ['did-navigate-in-page', sync],
      ['page-title-updated', sync],
      [
        'did-fail-load',
        (event) => {
          const detail = event as Event & { errorCode?: number; errorDescription?: string; isMainFrame?: boolean; validatedURL?: string }
          // -3 是被新的跳转打断，不算失败
          if (detail.isMainFrame && detail.errorCode !== -3) setFailed(`${detail.errorDescription ?? ''}　${detail.validatedURL ?? ''}`.trim())
        }
      ]
    ]
    for (const [name, handler] of handlers) el.addEventListener(name, handler)
    return () => {
      for (const [name, handler] of handlers) el.removeEventListener(name, handler)
    }
  }, [started])

  return (
    <>
      <div className="browser-bar">
        <button className="icon-btn" disabled={!nav.back} title={t('后退')} onClick={() => view.current?.goBack()}>
          <Icon name="left" size={14} />
        </button>
        <button className="icon-btn" disabled={!nav.forward} title={t('前进')} onClick={() => view.current?.goForward()}>
          <Icon name="right" size={14} />
        </button>
        <button className="icon-btn" disabled={!started} title={loading ? t('停止加载') : t('重新加载')} onClick={() => (loading ? view.current?.stop() : view.current?.reload())}>
          <Icon name={loading ? 'x' : 'refresh'} size={14} />
        </button>
        <input
          className="browser-address"
          value={address}
          placeholder={t('输入网址，比如 localhost:3000')}
          spellCheck={false}
          onChange={(event) => setAddress(event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) go(address)
          }}
        />
        <button className="icon-btn" disabled={!current} title={t('在系统浏览器里打开')} onClick={() => current && api.openExternal(current)}>
          <Icon name="external" size={14} />
        </button>
      </div>
      {loading && <div className="browser-loading" />}
      <div className="browser-view" title={title}>
        {started ? (
          // allowpopups：网页想开新窗口时要先让它「能开」，主进程才接得到这个请求，然后改成在原地打开
          <webview ref={view as Ref<HTMLWebViewElement>} src={first} partition="persist:pi-browser" {...POPUPS} />
        ) : (
          <div className="pane-empty">
            <div>{t('在上面输入网址。适合看本机跑起来的页面，比如 localhost:3000。')}</div>
            <div className="muted small">{t('这里的登录状态是独立的一份，和你平时用的浏览器不共用。')}</div>
            {last.current && (
              <button className="btn" onClick={() => go(last.current)}>
                {t('打开上次的页面')}
                <span className="muted ellipsis">　{last.current.replace(/^https?:\/\//, '').slice(0, 40)}</span>
              </button>
            )}
          </div>
        )}
        {failed && (
          <div className="browser-failed">
            <div>{t('这个页面打不开')}</div>
            <div className="muted small">{failed}</div>
            <button className="btn" onClick={() => go(address)}>
              {t('再试一次')}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
