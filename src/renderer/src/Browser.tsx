import { useCallback, useEffect, useRef, useState, type Ref } from 'react'
import { t } from '@shared/i18n'
import { api, useApp } from './store'
import { Icon, Popover } from './ui'

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
  getZoomFactor(): number
  setZoomFactor(factor: number): void
  setUserAgent(userAgent: string): void
  getWebContentsId(): number
}

const LAST_URL = 'browserUrl'
const VIEW = 'browserView'
const WIDTHS = 'browserWidths'
/**
 * 比面板宽的页面怎么放进来。很多网站是按电脑的宽屏排的，面板窄，照原样放只能看到一半。
 * fit：自动缩小到能看全；mobile：让网站给手机用的那一版，字不用缩小；actual：照原样，放不下就横着滚。
 */
type Mode = 'fit' | 'mobile' | 'actual'
const MODES: { id: Mode; icon: string; label: string; hint: string }[] = [
  { id: 'fit', icon: 'fit', label: t('缩小到能看全'), hint: t('页面比面板宽时自动缩小') },
  { id: 'mobile', icon: 'phone', label: t('手机版页面'), hint: t('让网站给窄屏用的那一版，字不用缩小') },
  { id: 'actual', icon: 'panel', label: t('原始大小'), hint: t('不缩小，放不下就横着滚') }
]
/** 再小字就认不出来了。缩到这个程度还放不下的页面，剩下的部分横着滚 */
const MIN_ZOOM = 0.5
/** 「手机版页面」时对网站自称是手机上的 Safari，网站就会给适合窄屏的那一版 */
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

/** 记着的网站太多了就丢掉最早的 */
const MAX_HOSTS = 300

const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}
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
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem(VIEW)
    return saved === 'mobile' || saved === 'actual' ? saved : 'fit'
  })
  const [zoom, setZoom] = useState(1)
  const [menu, setMenu] = useState(false)
  const modeRef = useRef(mode)
  modeRef.current = mode
  // 网页视图第一次出现时就要定好身份，之后再换要调它自己的方法
  const mobileAtStart = useRef(mode === 'mobile')
  const fitSeq = useRef(0)
  // 上一次没量成（窗口在后台，页面没排好），等回到前台再量
  const fitPending = useRef(false)
  const frame = useRef<HTMLDivElement>(null)
  /**
   * 每个网站要多宽才放得下（量出来的内容宽度；0 表示量过、不用缩）。
   * 记下来有两个好处：下次一进这个网站就直接是合适的大小，不用等页面出来再缩；
   * 面板拖宽拖窄时直接算，不用先回到原始大小再量一遍。
   */
  const widths = useRef<Record<string, number>>({})
  const loadWidths = (): Record<string, number> => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(WIDTHS) ?? '{}')
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === 'number')) as Record<string, number>
    } catch {
      // 读不懂就当没记过
    }
    return {}
  }
  useEffect(() => {
    widths.current = loadWidths()
  }, [])
  const remember = (host: string, wide: number | undefined) => {
    if (!host) return
    // 先读一遍存着的再改：别的窗口也可能刚记了别的网站，不能拿自己手里的旧的整个盖回去
    const all = loadWidths()
    // 先拿掉再放，等于挪到最后：丢的时候先丢很久没去的
    delete all[host]
    if (wide !== undefined) all[host] = Math.round(wide)
    const hosts = Object.keys(all)
    for (const old of hosts.slice(0, Math.max(0, hosts.length - MAX_HOSTS))) delete all[old]
    widths.current = all
    localStorage.setItem(WIDTHS, JSON.stringify(all))
  }
  /** 这个网站在这么宽的面板里该缩到多少 */
  const zoomFor = (host: string, panel: number): number => {
    const need = widths.current[host]
    // 往下取整：往上取的话会宽出几个像素，底下又冒出一条滚动条
    return need && panel > 0 && need > panel * 1.02 ? Math.max(MIN_ZOOM, Math.min(1, Math.floor((panel / need) * 100) / 100)) : 1
  }
  // 第一次去一个网站，还不知道它要多宽：页面先盖住，量好、缩好了再露出来，免得先看到一个放不下的页面再跳一下
  const [veil, setVeil] = useState(false)
  const veilTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cover = () => {
    setVeil(true)
    clearTimeout(veilTimer.current)
    // 页面迟迟出不来也不能一直盖着
    veilTimer.current = setTimeout(() => setVeil(false), 2500)
  }
  const uncover = () => {
    clearTimeout(veilTimer.current)
    setVeil(false)
  }

  /**
   * 按面板的宽度定页面的缩放：量一下内容有多宽，比面板宽就记下这个网站要多宽，再按「面板宽 ÷ 要的宽度」缩。
   *
   * 量之前先等页面「排好」：面板变宽、缩放改了之后，网页要过一会儿才按新的宽度重排，
   * 窗口在后台时甚至要等到回到前台。没排好就量，量到的是旧的宽度，会算出错的缩放。
   * 排好的标志是「页面排版宽 × 缩放 ≈ 面板宽」。
   */
  const refit = useCallback(async (attempt = 0): Promise<void> => {
    const el = view.current
    if (!el || !ready.current) return
    const mine = ++fitSeq.current
    const stale = () => mine !== fitSeq.current
    const settled = async () => {
      for (let i = 0; i < 12; i++) {
        // 让主进程去量：网页视图自带的办法要等整页加载完才给结果，那就又是先看好几秒放不下的页面
        const size = await api.browserMeasure(el.getWebContentsId())
        if (stale()) return undefined
        const panel = el.getBoundingClientRect().width
        const factor = el.getZoomFactor()
        if (size && panel > 0 && size.inner > 0 && Math.abs(size.inner * factor - panel) <= Math.max(4, panel * 0.03)) return { ...size, panel, factor }
        await new Promise((resolve) => setTimeout(resolve, 120))
        if (stale()) return undefined
      }
      return undefined
    }
    /** 这次没等到页面排好：过一会儿再来。窗口一直在后台的话就先放着，回到前台时会再量 */
    const later = () => {
      if (stale()) return
      fitPending.current = true
      if (attempt < 3 && !document.hidden) setTimeout(() => !stale() && void refit(attempt + 1), 900)
    }
    try {
      const now = await settled()
      if (!now) return later()
      fitPending.current = false
      // 只有「缩小到能看全」才动缩放；另外两种都按原始大小
      if (modeRef.current !== 'fit') {
        if (Math.abs(now.factor - 1) > 0.005) el.setZoomFactor(1)
        return setZoom(1)
      }
      const host = hostOf(el.getURL())
      // 内容比现在排的还宽：这个网站要这么宽。宽出来一点点的不算，很多页面有藏在屏幕外面的小东西
      if (now.wide > now.inner * 1.02) remember(host, now.wide)
      // 第一次量这个网站，放得下。如果它已经是缩着的（浏览器内核自己也会按网站记缩放），
      // 只能说明「排成现在这么宽放得下」，不能当成不用缩：那样会先放大到放不下，等加载完又缩回来
      else if (!(host in widths.current)) remember(host, now.factor < 0.995 ? now.inner : 0)
      const target = zoomFor(host, now.panel)
      if (Math.abs(target - now.factor) > 0.005) {
        el.setZoomFactor(target)
        // 等它按新的大小画出来，再让盖着的页面露出来
        await new Promise((resolve) => setTimeout(resolve, 90))
      }
      if (!stale()) setZoom(target)
    } catch {
      // 页面正在跳转，量不了；下一次加载完会再量
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (input: string) => {
    const url = toUrl(input)
    if (!url) return
    setAddress(url)
    setFailed(undefined)
    if (!started) {
      // 刚打开时缩放还没法设，要等页面有了内容；除非量过、知道它不用缩，否则先盖住
      if (mode === 'fit' && widths.current[hostOf(url)] !== 0) cover()
      return setFirst(url)
    }
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
          // 页面刚有了内容就量，不等图片这些都加载完：不然要先看好几秒放不下的页面，才缩到合适
          void refit().then(uncover)
        }
      ],
      [
        'did-start-navigation',
        (event) => {
          const detail = event as Event & { url?: string; isMainFrame?: boolean; isInPlace?: boolean }
          if (!detail.isMainFrame || detail.isInPlace || modeRef.current !== 'fit') return
          const host = hostOf(detail.url ?? '')
          // 去一个没量过的网站：先盖住，量好了再露出来
          if (host && host !== hostOf(el.getURL()) && !(host in widths.current)) cover()
        }
      ],
      ['did-start-loading', () => setLoading(true)],
      [
        'did-stop-loading',
        () => {
          setLoading(false)
          sync()
          // 后来才出来的内容可能把页面撑得更宽，再量一次
          void refit().then(uncover)
        }
      ],
      [
        'did-navigate',
        () => {
          sync()
          // 量过的网站：页面一换过来就先按记着的宽度缩好，不等它加载
          if (modeRef.current !== 'fit' || !ready.current) return
          const target = zoomFor(hostOf(el.getURL()), el.getBoundingClientRect().width)
          if (Math.abs(el.getZoomFactor() - target) > 0.005) el.setZoomFactor(target)
          setZoom(target)
        }
      ],
      [
        'did-navigate-in-page',
        () => {
          sync()
          void refit()
        }
      ],
      ['page-title-updated', sync],
      [
        'did-fail-load',
        (event) => {
          const detail = event as Event & { errorCode?: number; errorDescription?: string; isMainFrame?: boolean; validatedURL?: string }
          // -3 是被新的跳转打断，不算失败
          if (detail.isMainFrame && detail.errorCode !== -3) {
            setFailed(`${detail.errorDescription ?? ''}　${detail.validatedURL ?? ''}`.trim())
            uncover()
          }
        }
      ]
    ]
    for (const [name, handler] of handlers) el.addEventListener(name, handler)
    return () => {
      for (const [name, handler] of handlers) el.removeEventListener(name, handler)
    }
  }, [started, refit])

  // 面板拖宽、拖窄了：等手停下来再算一遍
  useEffect(() => {
    const box = frame.current
    if (!box || !started) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let width = box.clientWidth
    const observer = new ResizeObserver(() => {
      if (Math.abs(box.clientWidth - width) < 2) return
      width = box.clientWidth
      clearTimeout(timer)
      timer = setTimeout(() => void refit(), 200)
    })
    observer.observe(box)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [started, refit])

  // 窗口回到前台、或者从别的页签切回浏览器：上次没量成的现在补上
  useEffect(() => {
    if (!started) return
    const retry = () => {
      if (fitPending.current && !document.hidden) void refit()
    }
    window.addEventListener('focus', retry)
    document.addEventListener('visibilitychange', retry)
    return () => {
      window.removeEventListener('focus', retry)
      document.removeEventListener('visibilitychange', retry)
    }
  }, [started, refit])

  const choose = (next: Mode) => {
    setMenu(false)
    const el = view.current
    const usable = el && ready.current
    if (next === mode) {
      // 已经是「缩小到能看全」时再点一次：把这个网站记着的宽度忘掉，从原始大小重新量
      if (next !== 'fit' || !usable) return
      remember(hostOf(el.getURL()), undefined)
      el.setZoomFactor(1)
      return void refit()
    }
    const agentChanges = (next === 'mobile') !== (mode === 'mobile')
    setMode(next)
    modeRef.current = next
    localStorage.setItem(VIEW, next)
    uncover()
    if (!usable) return
    if (!agentChanges) return void refit()
    // 电脑版的身份就是这个应用自己的。不能去问网页视图原来是什么：上次选的是手机版的话，它一出生就是手机身份
    el.setUserAgent(next === 'mobile' ? MOBILE_UA : navigator.userAgent)
    // 手机版和电脑版要的宽度不一样，之前量的不能用了
    remember(hostOf(el.getURL()), undefined)
    el.reload()
  }
  const shrunk = mode === 'fit' && zoom < 0.995

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
        <div className="anchor">
          <button className={`icon-btn browser-zoom ${menu || shrunk || mode === 'mobile' ? 'active' : ''}`} data-popover-trigger="browser" title={t('比面板宽的页面怎么放进来')} onClick={() => setMenu(!menu)}>
            <Icon name={mode === 'mobile' ? 'phone' : 'fit'} size={14} />
            {shrunk && <span>{Math.round(zoom * 100)}%</span>}
          </button>
          {menu && (
            <Popover onClose={() => setMenu(false)} className="menu below end wide" group="browser">
              {MODES.map((item) => (
                <button key={item.id} className="menu-item two-line" onClick={() => choose(item.id)}>
                  <Icon name={item.icon} size={14} />
                  <span className="grow">
                    {item.label}
                    <span className="menu-hint">{item.id === 'fit' && shrunk ? t('这一页已经缩到 {percent}%', { percent: Math.round(zoom * 100) }) : item.hint}</span>
                  </span>
                  {mode === item.id && <Icon name="check" size={14} />}
                </button>
              ))}
            </Popover>
          )}
        </div>
        <button className="icon-btn" disabled={!current} title={t('在系统浏览器里打开')} onClick={() => current && api.openExternal(current)}>
          <Icon name="external" size={14} />
        </button>
      </div>
      {loading && <div className="browser-loading" />}
      <div className="browser-view" title={title} ref={frame}>
        {started ? (
          // allowpopups：网页想开新窗口时要先让它「能开」，主进程才接得到这个请求，然后改成在原地打开
          <webview ref={view as Ref<HTMLWebViewElement>} src={first} partition="persist:pi-browser" {...(mobileAtStart.current ? { useragent: MOBILE_UA } : {})} {...POPUPS} />
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
        {veil && started && !failed && <div className="browser-veil" />}
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
