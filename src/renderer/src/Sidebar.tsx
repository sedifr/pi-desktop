import { Slot } from './Buttons'
import { type DragEvent, type MouseEvent, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SessionMeta } from '@shared/types'
import {
  type Conv,
  activate,
  addProject,
  api,
  copyText,
  copyTranscriptPath,
  isSubagent,
  moveSession,
  newConv,
  openSession,
  projectDirs,
  removeProject,
  renameSession,
  setPinned,
  setPrefs,
  setSearchOpen,
  setView,
  togglePin,
  trashSession,
  useApp
} from './store'
import { Icon, Popover, baseName, relTime } from './ui'
import { t } from '@shared/i18n'

const VISIBLE = 6
const NO_PINS: string[] = []
/** 拖动时能放下的两处「置顶」位置：置顶区本身，和「项目」那一行标题 */
const PIN_AREA = '\0pinned'
const PIN_LABEL = '\0label'

interface Project {
  cwd: string
  sessions: SessionMeta[]
  drafts: Conv[]
  latest: number
  /** 这个项目有几个对话被置顶了（它们显示在上面的置顶区，不在项目下面重复出现） */
  pinned: number
}

interface RowMenu {
  meta: SessionMeta
  x: number
  y: number
}

/** 拖动对话时带的数据类型。聊天窗口靠它认出「拖进来的是一个对话」 */
export const SESSION_DRAG = 'application/x-pi-session'

/**
 * 「移到其他项目」旁边弹出来的项目列表。鼠标放上去就出来，不用再点一下。
 * 右边放不下就弹到左边，下面放不下就往上挪。
 */
function ProjectFlyout({ targets, onPick, onOther }: { targets: string[]; onPick: (cwd: string) => void; onOther: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: boolean; up: number }>({ left: false, up: 0 })
  useLayoutEffect(() => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    setPlace({ left: rect.right > window.innerWidth - 8, up: Math.max(0, rect.bottom - (window.innerHeight - 8)) })
  }, [targets.length])
  return (
    <div ref={box} className={`popover menu flyout ${place.left ? 'left' : ''}`} style={{ top: -6 - place.up }}>
      {targets.map((cwd) => (
        <button key={cwd} className="menu-item" title={cwd} onClick={() => onPick(cwd)}>
          <Icon name="folder" size={14} />
          <span className="grow ellipsis">{baseName(cwd)}</span>
        </button>
      ))}
      {targets.length > 0 && <div className="menu-sep" />}
      <button className="menu-item" onClick={onOther}>
        <Icon name="plus" size={14} />
        {t('选别的文件夹…')}
      </button>
    </div>
  )
}

const titleOf = (meta: SessionMeta): string => meta.name ?? meta.firstUserText ?? t('（空对话）')

export function Sidebar() {
  const sessions = useApp((s) => s.sessions)
  const convs = useApp((s) => s.convs)
  const activeKey = useApp((s) => s.activeKey)
  const extraProjects = useApp((s) => s.extraProjects)
  const view = useApp((s) => s.view)
  const pinnedIds = useApp((s) => s.config?.pinned) ?? NO_PINS
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useState<RowMenu>()
  const [flyout, setFlyout] = useState(false)
  const flyoutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // 正在侧栏里改名的对话
  const [renaming, setRenamingRow] = useState<string>()
  // 拖动：正在拖哪个对话、鼠标停在哪个能放下的地方、在置顶区里要插到谁的前面或后面
  const dragging = useRef<SessionMeta | undefined>(undefined)
  const [drag, setDrag] = useState<SessionMeta>()
  const [over, setOver] = useState<string>()
  const [insert, setInsert] = useState<{ id: string; before: boolean }>()

  const active = activeKey ? convs[activeKey] : undefined

  const pinned = useMemo(() => {
    const byId = new Map(sessions.map((meta) => [meta.id, meta]))
    return pinnedIds.map((id) => byId.get(id)).filter((meta): meta is SessionMeta => Boolean(meta?.cwd))
  }, [sessions, pinnedIds])

  const projects = useMemo(() => {
    const pins = new Set(pinnedIds)
    const map = new Map<string, Project>()
    const get = (cwd: string) => {
      let project = map.get(cwd)
      if (!project) map.set(cwd, (project = { cwd, sessions: [], drafts: [], latest: 0, pinned: 0 }))
      return project
    }
    for (const meta of sessions) {
      if (!meta.cwd || isSubagent(meta)) continue
      const project = get(meta.cwd)
      if (pins.has(meta.id)) project.pinned++
      else project.sessions.push(meta)
      project.latest = Math.max(project.latest, meta.modified)
    }
    for (const cwd of extraProjects) get(cwd)
    const known = new Set(sessions.map((meta) => meta.file))
    for (const conv of Object.values(convs)) {
      const project = get(conv.cwd)
      // 已经发过消息、但会话文件还没出现在列表里的新对话
      if (!known.has(conv.sessionFile ?? '') && (conv.messages.length || conv.pending.length)) project.drafts.push(conv)
    }
    return [...map.values()].sort((a, b) => b.latest - a.latest)
  }, [sessions, convs, extraProjects, pinnedIds])

  const runningFiles = new Set(Object.values(convs).filter((c) => c.streaming).map((c) => c.sessionFile ?? c.key))
  const unreadFiles = new Set(Object.values(convs).filter((c) => c.unread).map((c) => c.sessionFile ?? c.key))

  const confirmTrash = (meta: SessionMeta) => {
    if (window.confirm(`${t('把这个对话移到废纸篓？')}\n\n${meta.name ?? meta.firstUserText ?? ''}`)) void trashSession(meta)
  }

  // ---- 拖动 ----

  const endDrag = () => {
    dragging.current = undefined
    setDrag(undefined)
    setOver(undefined)
    setInsert(undefined)
  }
  const startDrag = (meta: SessionMeta) => (event: DragEvent) => {
    dragging.current = meta
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setData('text/plain', titleOf(meta))
    event.dataTransfer.setData(SESSION_DRAG, meta.file)
    // 等拖动真正开始了再改界面：在这一下里就动页面，浏览器会把拖动取消掉
    setTimeout(() => dragging.current === meta && setDrag(meta))
  }
  const accept = (event: DragEvent, zone: string) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (over !== zone) setOver(zone)
  }
  const leave = (zone: string) => (event: DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setOver((current) => (current === zone ? undefined : current))
    if (zone === PIN_AREA) setInsert(undefined)
  }
  /** 拖到一个项目上：把对话移进这个项目 */
  const projectZone = (cwd: string) => ({
    onDragOver: (event: DragEvent) => {
      const meta = dragging.current
      if (meta && meta.cwd !== cwd) accept(event, cwd)
    },
    onDragLeave: leave(cwd),
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      const meta = dragging.current
      endDrag()
      if (meta && meta.cwd !== cwd) void moveSession(meta, cwd)
    }
  })
  /** 拖到置顶区：置顶，或者给已经置顶的排顺序 */
  const pinZone = (zone: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!dragging.current) return
      accept(event, zone)
      if (!(event.target as Element).closest?.('.session-row')) setInsert(undefined)
    },
    onDragLeave: leave(zone),
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      const meta = dragging.current
      const at = zone === PIN_AREA ? insert : undefined
      endDrag()
      if (!meta) return
      const rest = pinnedIds.filter((id) => id !== meta.id)
      const index = at && at.id !== meta.id ? rest.indexOf(at.id) : -1
      if (index >= 0) rest.splice(at!.before ? index : index + 1, 0, meta.id)
      else if (pinnedIds.includes(meta.id)) return
      else rest.push(meta.id)
      void setPinned(rest)
    }
  })
  const overRow = (meta: SessionMeta) => (event: DragEvent) => {
    if (!dragging.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const before = event.clientY < rect.top + rect.height / 2
    if (insert?.id !== meta.id || insert.before !== before) setInsert({ id: meta.id, before })
  }

  // ---- 一行对话 ----

  const openMenu = (meta: SessionMeta) => (event: MouseEvent) => {
    event.preventDefault()
    setFlyout(false)
    setMenu({ meta, x: event.clientX, y: event.clientY })
  }
  const closeMenu = () => {
    clearTimeout(flyoutTimer.current)
    setFlyout(false)
    setMenu(undefined)
  }
  // 鼠标从「移到其他项目」滑向旁边的列表时会短暂离开，稍等一下再收
  const hoverFlyout = (open: boolean) => {
    clearTimeout(flyoutTimer.current)
    if (open) setFlyout(true)
    else flyoutTimer.current = setTimeout(() => setFlyout(false), 220)
  }

  const row = (meta: SessionMeta, inPinned: boolean) => {
    const isActive = active && (active.key === meta.file || active.sessionFile === meta.file)
    const mark = inPinned && insert?.id === meta.id && drag?.id !== meta.id ? (insert.before ? 'insert-before' : 'insert-after') : ''
    return (
      <div
        key={meta.file}
        className={`session-row ${inPinned ? 'pinned' : ''} ${isActive ? 'active' : ''} ${drag?.id === meta.id ? 'dragging' : ''} ${menu?.meta.id === meta.id ? 'menu-open' : ''} ${mark}`}
        draggable={renaming !== meta.file}
        onDragStart={startDrag(meta)}
        onDragEnd={endDrag}
        onDragOver={inPinned ? overRow(meta) : undefined}
        onContextMenu={openMenu(meta)}
        onClick={() => renaming !== meta.file && void openSession(meta)}
        onDoubleClick={(event) => !(event.target as Element).closest('button') && setRenamingRow(meta.file)}
      >
        {inPinned && <Icon name="pin" size={12} />}
        {renaming === meta.file ? (
          <input
            autoFocus
            className="row-rename grow"
            defaultValue={titleOf(meta)}
            placeholder={t('给这个对话起个名字')}
            onFocus={(event) => event.target.select()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onBlur={(event) => {
              // 点到别处就算改好了（和访达里改文件名一样）；按 Esc 才是不改
              if (renaming === meta.file) {
                setRenamingRow(undefined)
                if (event.target.value.trim() !== titleOf(meta)) void renameSession(meta, event.target.value)
              }
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return
              if (event.key === 'Enter') event.currentTarget.blur()
              else if (event.key === 'Escape') {
                event.currentTarget.value = titleOf(meta)
                event.currentTarget.blur()
              }
            }}
          />
        ) : (
          <span className="grow ellipsis" title={t('双击改名')}>
            {titleOf(meta)}
          </span>
        )}
        {inPinned && (
          <span className="session-tag" title={meta.cwd}>
            {baseName(meta.cwd)}
          </span>
        )}
        {runningFiles.has(meta.file) ? (
          <span className="dot-running" />
        ) : unreadFiles.has(meta.file) ? (
          <span className="dot-unread" title={t('有新结果')} />
        ) : (
          !inPinned && <span className="session-time">{relTime(meta.modified)}</span>
        )}
        <button
          className="icon-btn hover-only"
          title={inPinned ? t('取消置顶') : t('置顶')}
          onClick={(event) => {
            event.stopPropagation()
            void togglePin(meta)
          }}
        >
          <Icon name={inPinned ? 'unpin' : 'pin'} size={14} />
        </button>
        <button
          className="icon-btn hover-only"
          title={t('移到废纸篓')}
          onClick={(event) => {
            event.stopPropagation()
            confirmTrash(meta)
          }}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
    )
  }

  const moveToPicked = async (meta: SessionMeta) => {
    const dir = await api.pickFolder()
    if (dir) void moveSession(meta, dir)
  }

  const menuTargets = menu ? projectDirs({ sessions, extraProjects, convs }).filter((cwd) => cwd !== menu.meta.cwd) : []
  const labelIsZone = Boolean(drag && !pinnedIds.includes(drag.id))

  return (
    <aside className="sidebar">
      <div className="sidebar-drag">
        <button className="icon-btn" title={t('隐藏侧栏（⌘B）')} onClick={() => setPrefs({ sidebarCollapsed: true })}>
          <Icon name="sidebar" size={15} />
        </button>
      </div>
      <button className="nav-item" onClick={() => (active ? newConv(active.cwd) : projects[0] ? newConv(projects[0].cwd) : void addProject())}>
        <Icon name="edit" />
        {t('新对话')}
      </button>
      <button className="nav-item" data-part="side-search" title={t('按标题、项目名和对话里说过的话找对话')} onClick={() => setSearchOpen(true)}>
        <Icon name="search" />
        <span className="grow">{t('搜索')}</span>
        <kbd>⌘K</kbd>
      </button>
      <button className={`nav-item ${view === 'images' ? 'active' : ''}`} data-part="side-images" title={t('所有对话生成过的图片')} onClick={() => setView(view === 'images' ? 'chat' : 'images')}>
        <Icon name="image" />
        {t('图片')}
      </button>
      <Slot name="sidebar" />
      <div className="sidebar-scroll">
        {pinned.length > 0 && (
          <div className={`pin-area ${over === PIN_AREA && drag && !pinnedIds.includes(drag.id) ? 'drop' : ''}`} data-part="side-pinned" {...pinZone(PIN_AREA)}>
            <div className="sidebar-label">{t('置顶的对话')}</div>
            {pinned.map((meta) => row(meta, true))}
          </div>
        )}
        <div className={`sidebar-label sticky ${labelIsZone ? 'pin-zone' : ''} ${labelIsZone && over === PIN_LABEL ? 'drop' : ''}`} {...(labelIsZone ? pinZone(PIN_LABEL) : {})}>
          <span className="grow">{labelIsZone ? t('拖到这里置顶') : t('项目')}</span>
          {!labelIsZone && (
            <button className="icon-btn" title={t('添加项目文件夹，并在里面开始新对话')} onClick={() => void addProject()}>
              <Icon name="plus" size={14} />
            </button>
          )}
        </div>
        {projects.map((project) => {
          const isCollapsed = collapsed[project.cwd]
          const showAll = expanded[project.cwd]
          const list = showAll ? project.sessions : project.sessions.slice(0, VISIBLE)
          return (
            <div key={project.cwd} className={`project ${over === project.cwd ? 'drop' : ''}`} {...projectZone(project.cwd)}>
              <div className="project-row" title={project.cwd} onClick={() => setCollapsed({ ...collapsed, [project.cwd]: !isCollapsed })}>
                <Icon name={isCollapsed ? 'right' : 'down'} size={12} />
                <span className="grow ellipsis">{baseName(project.cwd)}</span>
                <button
                  className="icon-btn hover-only"
                  title={t('在这个项目里新建对话')}
                  onClick={(event) => {
                    event.stopPropagation()
                    newConv(project.cwd)
                  }}
                >
                  <Icon name="plus" size={14} />
                </button>
              </div>
              {!isCollapsed && (
                <>
                  {project.drafts.map((conv) => (
                    <div key={conv.key} className={`session-row ${conv.key === activeKey ? 'active' : ''}`} onClick={() => activate(conv.key)}>
                      <span className="grow ellipsis">{conv.title ?? t('新对话')}</span>
                      {conv.streaming ? <span className="dot-running" /> : conv.unread && <span className="dot-unread" title={t('有新结果')} />}
                    </div>
                  ))}
                  {list.map((meta) => row(meta, false))}
                  {project.sessions.length > VISIBLE && (
                    <div className="session-row muted" onClick={() => setExpanded({ ...expanded, [project.cwd]: !showAll })}>
                      {showAll ? t('收起') : t('显示全部 {n} 个', { n: project.sessions.length })}
                    </div>
                  )}
                  {!project.sessions.length && !project.drafts.length && project.pinned > 0 && (
                    <div className="session-row muted">{t('{n} 个对话在上面的置顶里', { n: project.pinned })}</div>
                  )}
                  {!project.sessions.length && !project.drafts.length && !project.pinned && (
                    <div className="session-row muted">
                      <span className="grow">{t('还没有对话')}</span>
                      <button
                        className="link-btn"
                        title={t('只是从列表里拿掉，不会删除文件夹')}
                        onClick={(event) => {
                          event.stopPropagation()
                          removeProject(project.cwd)
                        }}
                      >
                        {t('移除')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
      <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}>
        <Icon name="gear" />
        {t('设置')}
      </button>
      {menu && (
        <Popover className="menu row-menu" style={{ left: Math.min(menu.x, window.innerWidth - 236), top: Math.max(8, Math.min(menu.y, window.innerHeight - 290)) }} onClose={closeMenu}>
          <button
            className="menu-item"
            onClick={() => {
              closeMenu()
              void togglePin(menu.meta)
            }}
          >
            <Icon name={pinnedIds.includes(menu.meta.id) ? 'unpin' : 'pin'} size={14} />
            {pinnedIds.includes(menu.meta.id) ? t('取消置顶') : t('置顶')}
          </button>
          <button
            className="menu-item"
            onClick={() => {
              closeMenu()
              setRenamingRow(menu.meta.file)
            }}
          >
            <Icon name="edit" size={14} />
            {t('改名')}
          </button>
          <div className="flyout-host" onMouseEnter={() => hoverFlyout(true)} onMouseLeave={() => hoverFlyout(false)}>
            <button className={`menu-item ${flyout ? 'open' : ''}`} onClick={() => hoverFlyout(true)}>
              <Icon name="folder" size={14} />
              <span className="grow">{t('移到其他项目')}</span>
              <Icon name="right" size={12} />
            </button>
            {flyout && (
              <ProjectFlyout
                targets={menuTargets}
                onPick={(cwd) => {
                  closeMenu()
                  void moveSession(menu.meta, cwd)
                }}
                onOther={() => {
                  closeMenu()
                  void moveToPicked(menu.meta)
                }}
              />
            )}
          </div>
          <div className="menu-sep" />
          <button
            className="menu-item"
            title={t('把对话整理成一份只有文字的记录（去掉工具输出和图片），复制它的路径。最适合交给别的 AI 读')}
            onClick={() => {
              closeMenu()
              void copyTranscriptPath(menu.meta.file)
            }}
          >
            <Icon name="copy" size={14} />
            {t('复制文字版的路径')}
          </button>
          <button
            className="menu-item"
            title={menu.meta.file}
            onClick={() => {
              closeMenu()
              void copyText(menu.meta.file)
            }}
          >
            <Icon name="file" size={14} />
            {t('复制会话文件的路径')}
          </button>
          <button
            className="menu-item"
            title={menu.meta.id}
            onClick={() => {
              closeMenu()
              void copyText(menu.meta.id)
            }}
          >
            <Icon name="hash" size={14} />
            {t('复制对话 ID')}
          </button>
          <div className="menu-sep" />
          <button
            className="menu-item"
            onClick={() => {
              closeMenu()
              confirmTrash(menu.meta)
            }}
          >
            <Icon name="trash" size={14} />
            {t('移到废纸篓')}
          </button>
        </Popover>
      )}
    </aside>
  )
}
