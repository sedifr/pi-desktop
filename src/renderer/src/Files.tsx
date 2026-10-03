import { Fragment, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import type { DirEntry, DirListing } from '@shared/types'
import { type Conv, api, errorText, mentionFile } from './store'
import { Icon, baseName } from './ui'

/** 拖动文件时带的数据类型。聊天窗口靠它认出「拖进来的是项目里的一个文件」 */
export const FILE_DRAG = 'application/x-pi-file'

/**
 * 右侧面板的「文件」页：这个对话所在的项目文件夹，和里面的文件。
 * 点一个文件就把它 @ 进输入框；文件夹一层一层按需展开。
 */
export function Files({ conv, active }: { conv: Conv; active: boolean }) {
  const [listings, setListings] = useState<Record<string, DirListing | string>>({})
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<string[]>()
  const [added, setAdded] = useState<string>()
  const openRef = useRef(open)
  openRef.current = open
  const seq = useRef(0)

  const load = useCallback(
    (rel: string) =>
      api.filesList(conv.cwd, rel).then(
        (listing) => setListings((current) => ({ ...current, [rel]: listing })),
        (error) => setListings((current) => ({ ...current, [rel]: errorText(error) }))
      ),
    [conv.cwd]
  )
  /** 把项目文件夹和所有展开着的文件夹重新读一遍 */
  const reload = useCallback(() => {
    for (const rel of ['', ...openRef.current]) void load(rel)
  }, [load])

  // 看着这一页的时候才读：刚打开、Pi 做完一轮（可能新建或删了文件）、窗口回到前台
  useEffect(() => {
    if (active) reload()
  }, [active, reload, conv.streaming, conv.shellRunning])
  useEffect(() => {
    if (!active) return
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [active, reload])

  // 搜文件名：等手停一下再搜
  useEffect(() => {
    const mine = ++seq.current
    const text = query.trim()
    if (!text) return setFound(undefined)
    const timer = setTimeout(() => {
      api.filesSearch(conv.cwd, text).then(
        (files) => mine === seq.current && setFound(files),
        () => mine === seq.current && setFound([])
      )
    }, 120)
    return () => clearTimeout(timer)
  }, [query, conv.cwd])

  const toggle = (rel: string) => {
    const next = new Set(open)
    if (next.has(rel)) next.delete(rel)
    else {
      next.add(rel)
      void load(rel)
    }
    setOpen(next)
  }
  const mention = (file: string) => {
    mentionFile(conv.key, file)
    setAdded(file)
    setTimeout(() => setAdded((current) => (current === file ? undefined : current)), 1400)
  }

  const row = (entry: DirEntry, depth: number, label?: ReactNode) => (
    <div
      className={`file-row ${entry.name.startsWith('.') ? 'dim' : ''} ${added === entry.path ? 'added' : ''}`}
      style={{ paddingLeft: 6 + depth * 14 }}
      title={entry.dir ? entry.path : t('点一下，把它 @ 进输入框：{path}', { path: entry.path })}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy'
        event.dataTransfer.setData(FILE_DRAG, entry.dir ? `${entry.path}/` : entry.path)
        event.dataTransfer.setData('text/plain', entry.path)
      }}
      onClick={() => (entry.dir ? toggle(entry.path) : mention(entry.path))}
    >
      {entry.dir ? <Icon name={open.has(entry.path) ? 'down' : 'right'} size={11} /> : <span className="file-gap" />}
      <Icon name={entry.dir ? 'folder' : 'file'} size={13} />
      <span className="grow ellipsis">{label ?? entry.name}</span>
      {added === entry.path && <span className="file-added">{t('已 @')}</span>}
      {entry.dir && (
        <button
          className="icon-btn hover-only file-at"
          title={t('把这个文件夹 @ 进输入框')}
          onClick={(event) => {
            event.stopPropagation()
            mention(`${entry.path}/`)
          }}
        >
          @
        </button>
      )}
      {!entry.dir && (
        <button
          className="icon-btn hover-only"
          title={t('用默认的应用打开')}
          onClick={(event) => {
            event.stopPropagation()
            api.fileOpen(conv.cwd, entry.path)
          }}
        >
          <Icon name="external" size={13} />
        </button>
      )}
      <button
        className="icon-btn hover-only"
        title={t('在访达中显示')}
        onClick={(event) => {
          event.stopPropagation()
          api.fileReveal(conv.cwd, entry.path)
        }}
      >
        <Icon name="folder" size={13} />
      </button>
    </div>
  )

  const tree = (rel: string, depth: number): ReactNode => {
    const listing = listings[rel]
    const pad = { paddingLeft: 6 + depth * 14 + 17 }
    if (listing === undefined) return <div className="file-row note" style={pad}>{t('正在读取…')}</div>
    if (typeof listing === 'string') return <div className="file-row note" style={pad}>{listing}</div>
    return (
      <>
        {listing.entries.map((entry) => (
          <Fragment key={entry.path}>
            {row(entry, depth)}
            {entry.dir && open.has(entry.path) && tree(entry.path, depth + 1)}
          </Fragment>
        ))}
        {!listing.entries.length && <div className="file-row note" style={pad}>{t('空的')}</div>}
        {listing.more > 0 && <div className="file-row note" style={pad}>{t('还有 {n} 项没列出来，可以用上面的搜索找', { n: listing.more })}</div>}
      </>
    )
  }

  return (
    <div className="pane-scroll">
      <div className="pane-bar">
        <Icon name="folder" size={14} />
        <span className="files-root ellipsis" title={conv.cwd}>
          {baseName(conv.cwd)}
        </span>
        <span className="grow ellipsis muted files-path" title={conv.cwd}>
          {`\u200e${conv.cwd}`}
        </span>
        <button className="icon-btn" title={t('在访达中显示')} onClick={() => api.fileReveal(conv.cwd, '.')}>
          <Icon name="external" size={13} />
        </button>
        <button className="icon-btn" title={t('重新读取')} onClick={reload}>
          <Icon name="refresh" size={13} />
        </button>
      </div>
      <div className="files-search">
        <Icon name="search" size={13} />
        <input value={query} placeholder={t('搜文件名')} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Escape' && setQuery('')} />
        {query && (
          <button className="icon-btn" title={t('清空')} onClick={() => setQuery('')}>
            <Icon name="x" size={11} />
          </button>
        )}
      </div>
      {found ? (
        <>
          {found.map((file) => {
            const cut = file.lastIndexOf('/')
            return (
              <Fragment key={file}>
                {row(
                  { name: file.slice(cut + 1), path: file, dir: false },
                  0,
                  <>
                    {file.slice(cut + 1)}
                    {cut >= 0 && <span className="muted">　{file.slice(0, cut)}</span>}
                  </>
                )}
              </Fragment>
            )
          })}
          {!found.length && <div className="pane-empty">{t('没有找到这个名字的文件')}</div>}
        </>
      ) : (
        tree('', 0)
      )}
      <div className="files-hint">{t('点文件就把它 @ 进输入框，也可以拖进聊天窗口。在输入框里直接打 @ 也能搜文件。')}</div>
    </div>
  )
}
