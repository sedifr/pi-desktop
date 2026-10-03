import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { SearchHit, SessionMeta } from '@shared/types'
import { api, errorText, isSubagent, openHit, setSearchOpen, toast, useApp } from './store'
import { Icon, baseName, relTime } from './ui'
import { t } from '@shared/i18n'

const RECENT = 8

/** 把对上的词标出来 */
function Marked({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>
  const lower = text.toLowerCase()
  const out: ReactNode[] = []
  let at = 0
  while (at < text.length) {
    let next = -1
    let length = 0
    for (const term of terms) {
      const found = lower.indexOf(term, at)
      if (found >= 0 && (next < 0 || found < next)) [next, length] = [found, term.length]
    }
    if (next < 0) break
    if (next > at) out.push(text.slice(at, next))
    out.push(<mark key={next}>{text.slice(next, next + length)}</mark>)
    at = next + length
  }
  out.push(text.slice(at))
  return <>{out}</>
}

/** 搜索对话：按标题、项目名和对话里说过的话找。⌘K 打开，不输入时列出最近的对话，可以当快速切换用 */
export function SearchPalette() {
  const sessions = useApp((s) => s.sessions)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>()
  const [selected, setSelected] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  const terms = useMemo(() => [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))], [query])
  const byFile = useMemo(() => new Map(sessions.map((meta) => [meta.file, meta])), [sessions])

  useEffect(() => {
    const mine = ++seq.current
    if (!terms.length) return setHits(undefined)
    // 等手停一下再搜，打字时不用每个字都搜一遍
    const timer = setTimeout(() => {
      api.searchSessions(query).then(
        (found) => mine === seq.current && (setHits(found), setSelected(0)),
        (error) => mine === seq.current && toast(errorText(error), 'error')
      )
    }, 90)
    return () => clearTimeout(timer)
  }, [query, terms])

  const rows: { meta: SessionMeta; hit?: SearchHit }[] = useMemo(() => {
    if (!terms.length) return sessions.filter((meta) => meta.cwd && !isSubagent(meta)).slice(0, RECENT).map((meta) => ({ meta }))
    return (hits ?? []).flatMap((hit) => {
      const meta = byFile.get(hit.file)
      return meta ? [{ meta, hit }] : []
    })
  }, [terms, sessions, hits, byFile])

  useEffect(() => {
    list.current?.querySelector('.search-row.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selected, rows])

  const open = (index: number) => {
    const row = rows[index]
    if (row) void openHit(row.meta, row.hit?.entryId)
  }

  return (
    <div className="overlay search-overlay" onMouseDown={(event) => event.target === event.currentTarget && setSearchOpen(false)}>
      <div className="search-box">
        <div className="search-input">
          <Icon name="search" size={15} />
          <input
            autoFocus
            value={query}
            placeholder={t('搜对话：标题、项目名，或者对话里说过的话')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // 输入法正在选字时，方向键和回车都是给输入法的
              if (event.nativeEvent.isComposing || event.keyCode === 229) return
              if (event.key === 'Escape') setSearchOpen(false)
              else if (event.key === 'Enter') open(selected)
              else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                if (rows.length) setSelected((selected + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length)
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="search-list" ref={list}>
          {!terms.length && rows.length > 0 && <div className="menu-label">{t('最近的对话')}</div>}
          {rows.map(({ meta, hit }, index) => (
            <div key={meta.file} className={`search-row ${index === selected ? 'selected' : ''}`} onMouseMove={() => index !== selected && setSelected(index)} onClick={() => open(index)}>
              <div className="search-title">
                <span className="grow ellipsis">
                  <Marked text={meta.name ?? meta.firstUserText ?? t('（空对话）')} terms={terms} />
                </span>
                <span className="search-meta" title={meta.cwd}>
                  <Marked text={baseName(meta.cwd)} terms={terms} /> · {relTime(meta.modified)}
                </span>
              </div>
              {hit?.snippet && (
                <div className="search-snippet">
                  <span className="search-who">{hit.role === 'user' ? t('你') : 'Pi'}</span>
                  <Marked text={hit.snippet} terms={terms} />
                </div>
              )}
            </div>
          ))}
          {terms.length > 0 && hits && !rows.length && <div className="menu-empty">{t('没有找到。换个词试试，多个词用空格隔开')}</div>}
          {!terms.length && !rows.length && <div className="menu-empty">{t('还没有对话')}</div>}
        </div>
        <div className="search-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> {t('选择')}
          </span>
          <span>
            <kbd>Enter</kbd> {t('打开')}
          </span>
        </div>
      </div>
    </div>
  )
}
