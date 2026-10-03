import { useCallback, useEffect, useRef, useState } from 'react'
import { getLang, t } from '@shared/i18n'
import type { MarketItem } from '@shared/types'
import { installing } from './installing'
import { api, commandsChanged, errorText, setSettingsTab, toast } from './store'
import { Icon, relTime } from './ui'

/** 推荐页上的几类。点一个就只看带这个关键词的包 */
const TOPICS: { id: string; label: string }[] = [
  { id: '', label: t('最常用') },
  { id: 'pi-extension', label: t('扩展') },
  { id: 'skills', label: t('技能') },
  { id: 'mcp', label: 'MCP' },
  { id: 'subagents', label: t('子代理') },
  { id: 'memory', label: t('记忆') },
  { id: 'web-search', label: t('联网搜索') },
  { id: 'provider', label: t('模型接入') }
]

const count = (n: number): string => new Intl.NumberFormat(getLang() === 'en' ? 'en' : 'zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

/**
 * 插件市场：Pi 的包目录（npm 上带 pi-package 关键词的包，和 pi.dev/packages 是同一批）。
 * 不搜索时按下载量列出最常用的；可以按类别看，也可以搜。装和「安装技能」页走的是同一条路。
 */
export function Market() {
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState('')
  const [items, setItems] = useState<MarketItem[]>()
  const [more, setMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(installing.label)
  const [lines, setLines] = useState(installing.lines)
  const seq = useRef(0)

  const loadInstalled = useCallback(() => {
    // 装的时候写的是 npm:包名 或 npm:包名@版本
    api.packagesList().then(
      (list) => setInstalled(new Set(list.filter((item) => item.kind === 'npm').map((item) => item.source.replace(/^npm:/, '').replace(/(?!^)@[^@/]*$/, '')))),
      () => {}
    )
  }, [])
  useEffect(loadInstalled, [loadInstalled])
  useEffect(() => {
    const sync = () => {
      setBusy(installing.label)
      setLines(installing.lines)
      if (!installing.label) loadInstalled()
    }
    installing.listeners.add(sync)
    return () => void installing.listeners.delete(sync)
  }, [loadInstalled])

  const load = useCallback(
    (from: number) => {
      const mine = ++seq.current
      setLoading(true)
      setError(undefined)
      api.marketSearch(query, topic, from).then(
        (page) => {
          if (mine !== seq.current) return
          setItems((current) => (from ? [...(current ?? []), ...page.items.filter((item) => !current?.some((have) => have.name === item.name))] : page.items))
          setMore(page.more)
          setTotal(page.total)
          setLoading(false)
        },
        (failure) => {
          if (mine !== seq.current) return
          setError(errorText(failure))
          setLoading(false)
        }
      )
    },
    [query, topic]
  )
  // 等手停一下再搜
  useEffect(() => {
    const timer = setTimeout(() => load(0), query ? 350 : 0)
    return () => clearTimeout(timer)
  }, [load, query])

  const install = async (item: MarketItem) => {
    const who = item.publisher ? t('发布者 {name}', { name: item.publisher }) : 'npm'
    if (!window.confirm(`${t('安装「{name}」？', { name: item.name })}\n\n${t('来源：npm（{who}）。包里的扩展会在你的电脑上运行代码，只装你信得过的。', { who })}`)) return
    installing.set(t('正在安装 {source}…', { source: item.name }), [])
    try {
      await api.packageInstall(`npm:${item.name}`)
      toast(t('已安装。新的技能和工具从下一条消息起可用'))
    } catch (failure) {
      toast(errorText(failure).slice(-400), 'error')
    }
    installing.set(undefined, [])
    commandsChanged()
  }

  return (
    <>
      <div className="set-note">
        {t('Pi 的包目录：别人打包好的技能、扩展、指令和主题，和 pi.dev/packages 上列的是同一批。不搜索时按每周下载量排，最常用的在前面。')}
        <br />
        {t('这里谁都能发布，没有人审核。扩展能在你的电脑上运行代码，装之前看看它的来源和下载量。')}
      </div>
      <div className="files-search market-search">
        <Icon name="search" size={14} />
        <input autoFocus value={query} placeholder={t('搜包名、功能，比如 memory、browser、review')} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Escape' && setQuery('')} />
        {query && (
          <button className="icon-btn" title={t('清空')} onClick={() => setQuery('')}>
            <Icon name="x" size={11} />
          </button>
        )}
      </div>
      <div className="market-topics">
        {TOPICS.map((item) => (
          <button key={item.id} className={`chip ${topic === item.id ? 'on' : ''}`} onClick={() => setTopic(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {busy && (
        <div className="install-log">
          <div>
            <span className="dot-running" /> {busy}
          </div>
          {lines.map((line, index) => (
            <div key={index} className="muted small mono ellipsis">
              {line}
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="banner error">
          {error}{' '}
          <button className="link-btn" onClick={() => load(0)}>
            {t('再试一次')}
          </button>
        </div>
      )}
      {!items && !error && <div className="cap-empty">{t('正在读取…')}</div>}
      {items && !items.length && !loading && <div className="cap-empty">{t('没有找到。换个词试试，或者去掉上面选的类别')}</div>}
      {items?.map((item) => (
        <div key={item.name} className="market-item">
          <div className="market-main">
            <div className="market-name">
              <span className="mono ellipsis">{item.name}</span>
              <span className="muted small">v{item.version}</span>
              {item.publisher && <span className="muted small ellipsis">· {item.publisher}</span>}
            </div>
            {item.description && <div className="market-desc">{item.description}</div>}
            <div className="market-meta">
              <span title={t('最近一周的下载次数')}>
                <Icon name="down" size={11} /> {t('{n} 次/周', { n: count(item.weekly) })}
              </span>
              {item.updated && <span>{t('更新于 {time}', { time: relTime(Date.parse(item.updated)) })}</span>}
              {item.keywords.slice(0, 4).map((word) => (
                <span key={word} className="market-tag">
                  {word}
                </span>
              ))}
            </div>
          </div>
          <div className="market-actions">
            {installed.has(item.name) ? (
              <span className="market-done">
                <Icon name="check" size={13} /> {t('已安装')}
              </span>
            ) : (
              <button className="btn primary" disabled={Boolean(busy)} onClick={() => void install(item)}>
                {t('安装')}
              </button>
            )}
            <button className="link-btn" title={item.npm} onClick={() => api.openExternal(item.repo && /^https:\/\//.test(item.repo) ? item.repo : item.npm)}>
              {t('看详情')}
            </button>
          </div>
        </div>
      ))}
      {items && items.length > 0 && (
        <div className="market-foot">
          {more ? (
            <button className="btn" disabled={loading} onClick={() => load(items.length)}>
              {loading ? t('正在读取…') : t('再看一些')}
            </button>
          ) : (
            <span className="muted small">{t('就这些了')}</span>
          )}
          <span className="grow" />
          <span className="muted small">{!query && !topic ? t('目录里一共 {n} 个包', { n: count(total) }) : ''}</span>
          <button className="link-btn" onClick={() => setSettingsTab('sources')}>
            {t('管理已装的，或者从 git、本机文件夹安装…')}
          </button>
        </div>
      )}
    </>
  )
}
