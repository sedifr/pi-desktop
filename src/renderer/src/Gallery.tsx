import { useCallback, useEffect, useMemo, useState } from 'react'
import { t } from '@shared/i18n'
import type { ImageInfo } from '@shared/types'
import { api, copyText, errorText, openSession, previewImage, setConfig, setView, toast, useApp } from './store'
import { Icon, baseName, imgUrl, relTime } from './ui'

export const fmtSize = (bytes: number): string => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/** 一张图给人看的名字：有生成要求就用要求的第一句，没有就用文件名 */
export const imageTitle = (image: ImageInfo): string => (image.prompt ?? image.name).split('\n')[0]

/**
 * 图库：所有对话生成过的图片放在一处看和清理。
 * 图片本身还在各自的文件夹里，这里只是把它们列出来。
 */
export function Gallery() {
  const config = useApp((s) => s.config)
  const version = useApp((s) => s.imagesVersion)
  const [list, setList] = useState<ImageInfo[]>()
  const [project, setProject] = useState<string>()
  const [query, setQuery] = useState('')
  const [orphans, setOrphans] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const reload = useCallback(() => {
    api.imagesList().then(setList, (error) => {
      setList([])
      toast(errorText(error), 'error')
    })
  }, [])
  // 预览里删了图、换了存放位置之后，这里也跟着刷新
  useEffect(reload, [reload, version])

  const projects = useMemo(() => {
    const count = new Map<string, number>()
    for (const image of list ?? []) if (image.cwd) count.set(image.cwd, (count.get(image.cwd) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1])
  }, [list])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (list ?? []).filter((image) => (!project || image.cwd === project) && (!orphans || !image.session) && (!q || `${image.name} ${image.prompt ?? ''} ${image.sessionTitle ?? ''}`.toLowerCase().includes(q)))
  }, [list, project, orphans, query])

  const total = (list ?? []).reduce((sum, image) => sum + image.size, 0)
  const pickedList = shown.filter((image) => picked.has(image.path))
  const toggle = (file: string) =>
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(file)) next.add(file)
      return next
    })

  const trash = async () => {
    if (!pickedList.length) return
    if (!window.confirm(t('把这 {n} 张图片移到废纸篓？对话里已经显示过的图不受影响，那里看到的是对话记录里存的一份。', { n: pickedList.length }))) return
    try {
      const done = await api.imagesTrash(pickedList.map((image) => image.path))
      toast(t('{n} 张图片已移到废纸篓', { n: done }))
    } catch (error) {
      toast(errorText(error), 'error')
    }
    setPicked(new Set())
    reload()
  }

  return (
    <div className="settings">
      <header className="header">
        <span className="header-title">{t('图片')}</span>
        {list && <span className="muted small">{t('共 {n} 张，{size}', { n: list.length, size: fmtSize(total) })}</span>}
        <span className="grow" />
        <button className="chip" onClick={() => setView('chat')}>
          <Icon name="x" size={14} />
          {t('关闭')}
        </button>
      </header>
      <div className="gallery">
        <div className="gallery-bar">
          <div className="gallery-chips">
            <button className={`chip ${!project ? 'active' : ''}`} onClick={() => setProject(undefined)}>
              {t('全部')}
            </button>
            {projects.map(([cwd, count]) => (
              <button key={cwd} className={`chip ${project === cwd ? 'active' : ''}`} title={cwd} onClick={() => setProject(project === cwd ? undefined : cwd)}>
                <span className="ellipsis">{baseName(cwd)}</span>
                <span className="strip-count">{count}</span>
              </button>
            ))}
            <button className={`chip ${orphans ? 'active' : ''}`} title={t('对话已经删掉、图片还留着的那些')} onClick={() => setOrphans(!orphans)}>
              {t('没有对话的')}
            </button>
          </div>
          <label className="cap-search">
            <Icon name="search" size={13} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('搜画的是什么')} />
          </label>
        </div>

        {!list && <div className="cap-empty">{t('正在读取…')}</div>}
        {list && !list.length && (
          <div className="gallery-empty">
            <Icon name="image" size={28} />
            <div>{t('还没有图片')}</div>
            <div className="muted small">{t('对话里让 Pi 生成的图片会出现在这里，不管是在哪个项目、哪个对话里生成的。')}</div>
          </div>
        )}
        {list && list.length > 0 && !shown.length && <div className="cap-empty">{t('没有匹配的图片')}</div>}
        <div className="gallery-grid">
          {shown.map((image) => (
            <div key={image.path} className={`gallery-tile ${picked.has(image.path) ? 'picked' : ''}`}>
              <button className="gallery-thumb" title={image.prompt ?? image.name} onClick={() => previewImage(image.path)}>
                <img src={imgUrl(image.path)} alt={imageTitle(image)} loading="lazy" decoding="async" />
              </button>
              <button className="gallery-check" title={t('选中')} onClick={() => toggle(image.path)}>
                {picked.has(image.path) && <Icon name="check" size={12} />}
              </button>
              <div className="gallery-caption">
                <div className="ellipsis">{imageTitle(image)}</div>
                <div className="muted small ellipsis">
                  {[image.cwd && baseName(image.cwd), relTime(image.modified), fmtSize(image.size)].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="set-row gallery-where">
          <div className="set-label grow">
            {t('新图片存到哪')}
            <div className="muted small">
              {config?.imageDir
                ? t('统一存到 {dir}。出图的工具支持这个设置时才会照做。', { dir: config.imageDir })
                : t('由出图的工具自己决定，一般是各个项目里的 pi-images 文件夹。想把以后的图都放在一处，可以指定一个文件夹。')}
            </div>
          </div>
          <div className="set-control">
            <button className="btn" onClick={() => void api.imageDirPick().then(setConfig)}>
              {config?.imageDir ? t('换一个文件夹') : t('统一存到一个文件夹…')}
            </button>
            {config?.imageDir && (
              <button className="btn" onClick={() => void api.imageDirClear().then(setConfig)}>
                {t('改回各项目自己存')}
              </button>
            )}
          </div>
        </div>
      </div>

      {pickedList.length > 0 && (
        <div className="gallery-actions">
          <span className="grow">{t('选中了 {n} 张，{size}', { n: pickedList.length, size: fmtSize(pickedList.reduce((sum, image) => sum + image.size, 0)) })}</span>
          <button className="btn" onClick={() => setPicked(new Set(shown.map((image) => image.path)))}>
            {t('全选这一页')}
          </button>
          <button className="btn" onClick={() => setPicked(new Set())}>
            {t('取消选择')}
          </button>
          <button className="btn primary" onClick={() => void trash()}>
            {t('移到废纸篓')}
          </button>
        </div>
      )}
    </div>
  )
}

/** 点开一张图：放大看，顺便能复制、另存、找到它在哪、回到生成它的对话 */
export function ImagePreview({ path }: { path: string }) {
  const sessions = useApp((s) => s.sessions)
  const [info, setInfo] = useState<ImageInfo>()
  useEffect(() => {
    api.imagesList().then(
      (list) => setInfo(list.find((image) => image.path === path)),
      () => {}
    )
  }, [path])
  const close = () => previewImage(undefined)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const session = info?.session ? sessions.find((meta) => meta.file === info.session) : undefined
  const fail = (error: unknown) => toast(errorText(error), 'error')
  const copy = () => void api.imageCopy(path).then(() => toast(t('已复制')), fail)
  // 另存时用户可能点了取消，那就什么都不说
  const saveAs = () => void api.imageSaveAs(path).then((saved) => saved && toast(t('已另存到 {path}', { path: saved })), fail)
  const trash = async () => {
    if (!window.confirm(t('把这张图片移到废纸篓？'))) return
    try {
      await api.imagesTrash([path])
      toast(t('{n} 张图片已移到废纸篓', { n: 1 }))
      previewImage(undefined, true)
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  return (
    <div className="overlay preview" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="preview-box">
        <img src={imgUrl(path)} alt={info ? imageTitle(info) : ''} />
        <div className="preview-side">
          <div className="preview-title">{info ? info.name : baseName(path)}</div>
          {info && <div className="muted small">{[info.cwd && baseName(info.cwd), relTime(info.modified), fmtSize(info.size)].filter(Boolean).join(' · ')}</div>}
          {info?.prompt ? (
            <>
              <div className="preview-label">
                <span className="grow">{t('提示词')}</span>
                <button className="link-btn" onClick={() => void copyText(info.prompt!)}>
                  <Icon name="copy" size={12} /> {t('复制提示词')}
                </button>
              </div>
              <div className="preview-prompt">{info.prompt}</div>
            </>
          ) : (
            <span className="grow" />
          )}
          {session && (
            <button
              className="btn"
              onClick={() => {
                close()
                void openSession(session)
              }}
            >
              <Icon name="left" size={12} /> {t('回到生成它的对话')}
            </button>
          )}
          <button className="btn" onClick={copy}>
            {t('复制图片')}
          </button>
          <button className="btn" onClick={saveAs}>
            {t('另存为…')}
          </button>
          <button className="btn" onClick={() => api.imageReveal(path)}>
            {t('在访达中显示')}
          </button>
          {info && (
            <button className="btn" onClick={() => void trash()}>
              {t('移到废纸篓')}
            </button>
          )}
          <button className="btn primary" onClick={close}>
            {t('关闭')}
          </button>
        </div>
      </div>
    </div>
  )
}
