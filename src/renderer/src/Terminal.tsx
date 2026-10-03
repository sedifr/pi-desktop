import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as Xterm, type ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { t } from '@shared/i18n'
import { api, errorText } from './store'
import { Icon, baseName } from './ui'

/** 终端的配色跟着界面走：底色和文字取界面当前用的，十六种颜色用一套深浅都看得清的 */
function themeNow(): ITheme {
  const css = getComputedStyle(document.documentElement)
  const dark = matchMedia('(prefers-color-scheme: dark)').matches
  const pick = (name: string) => css.getPropertyValue(name).trim()
  return {
    background: pick('--bg'),
    foreground: pick('--text'),
    cursor: pick('--text'),
    cursorAccent: pick('--bg'),
    selectionBackground: dark ? 'rgba(122,167,255,0.3)' : 'rgba(37,99,235,0.2)',
    black: dark ? '#3a3a3d' : '#1a1a1a',
    red: dark ? '#ff7b6b' : '#c0392b',
    green: dark ? '#5fd38d' : '#1e8e4e',
    yellow: dark ? '#e5c07b' : '#a8750e',
    blue: dark ? '#7aa7ff' : '#2563eb',
    magenta: dark ? '#c792ea' : '#9333a8',
    cyan: dark ? '#56c8d8' : '#0e7a8a',
    white: dark ? '#d0d0d4' : '#6b6b70',
    brightBlack: dark ? '#77777c' : '#8e8e93',
    brightRed: dark ? '#ff9a8d' : '#e0503f',
    brightGreen: dark ? '#84e3a8' : '#2aa85f',
    brightYellow: dark ? '#f0d399' : '#c98a1b',
    brightBlue: dark ? '#9dbfff' : '#4f83f1',
    brightMagenta: dark ? '#dab0f5' : '#b055c5',
    brightCyan: dark ? '#7fdbe8' : '#1a9aad',
    brightWhite: dark ? '#ffffff' : '#1a1a1a'
  }
}

/**
 * 一个项目文件夹里的终端。真正的 shell 跑在主进程那边，这里只负责显示和把按键送过去。
 * active 为假时它只是被藏起来，里面的内容和正在跑的程序都还在。
 */
export function TerminalView({ cwd, active }: { cwd: string; active: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Xterm | undefined>(undefined)
  const fit = useRef<FitAddon | undefined>(undefined)
  const [ended, setEnded] = useState(false)
  const [round, setRound] = useState(0)
  const id = `term:${cwd}`
  // 现在是不是真的在眼前。藏起来的时候不能去量大小
  const shown = useRef(active)
  shown.current = active

  useEffect(() => {
    const el = host.current
    if (!el) return
    const xterm = new Xterm({
      fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
      fontSize: 12.5,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 5000,
      macOptionIsMeta: true,
      allowProposedApi: false,
      theme: themeNow()
    })
    const fitter = new FitAddon()
    xterm.loadAddon(fitter)
    xterm.open(el)
    term.current = xterm
    fit.current = fitter
    setEnded(false)
    // 开发时留一个把手，方便检查终端里实际有什么
    if (import.meta.env.DEV) (el as HTMLDivElement & { __term?: Xterm }).__term = xterm

    const resize = () => {
      // 面板收起或切到别的页时，这块地方会被压得很窄。那时去量大小，终端会被改成只有两三列宽，
      // 里面已有的内容全被折成一列一列的。只在真的看得见、够宽的时候才量
      if (!shown.current || el.offsetWidth < 160 || el.offsetHeight < 80) return
      try {
        fitter.fit()
        api.termResize(id, xterm.cols, xterm.rows)
      } catch {
        // 还没准备好
      }
    }
    resize()
    api.termCreate(id, cwd, xterm.cols, xterm.rows).catch((error) => xterm.writeln(`\x1b[31m${errorText(error)}\x1b[0m`))

    const offData = api.onTermData((which, data) => which === id && xterm.write(data))
    const offExit = api.onTermExit((which) => {
      if (which !== id) return
      xterm.writeln(`\r\n\x1b[2m${t('[终端已结束。点上面的「重新开始」再开一个]')}\x1b[0m`)
      setEnded(true)
    })
    const typing = xterm.onData((data) => api.termWrite(id, data))
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    const scheme = matchMedia('(prefers-color-scheme: dark)')
    const retheme = () => (xterm.options.theme = themeNow())
    scheme.addEventListener('change', retheme)
    window.addEventListener('pi-look', retheme)

    return () => {
      scheme.removeEventListener('change', retheme)
      window.removeEventListener('pi-look', retheme)
      observer.disconnect()
      typing.dispose()
      offData()
      offExit()
      xterm.dispose()
      term.current = undefined
    }
    // round 变了就是要重新开一个
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, round])

  // 切回这一页时重新量一次大小，并把光标放进来
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => {
      const el = host.current
      try {
        if (el && el.offsetWidth >= 160 && el.offsetHeight >= 80) {
          fit.current?.fit()
          if (term.current) api.termResize(id, term.current.cols, term.current.rows)
        }
      } catch {
        // 同上
      }
      term.current?.focus()
    }, 30)
    return () => clearTimeout(timer)
  }, [active, id])

  const restart = () => {
    api.termKill(id)
    setRound(round + 1)
  }

  return (
    <div className={`term-view ${active ? 'on' : ''}`}>
      <div className="pane-bar">
        <Icon name="folder" size={13} />
        <span className="grow ellipsis" title={cwd}>
          {baseName(cwd)}
        </span>
        <button className="link-btn" title={t('清掉屏幕上的内容。正在跑的程序不受影响')} onClick={() => term.current?.clear()}>
          {t('清屏')}
        </button>
        <button className="link-btn" title={t('结束现在这个终端，在项目文件夹里重新开一个')} onClick={restart}>
          {ended ? t('重新开始') : t('重开')}
        </button>
      </div>
      <div className="terminal-host" ref={host} onClick={() => term.current?.focus()} />
    </div>
  )
}
