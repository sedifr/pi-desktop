import { useMemo, useState } from 'react'
import type { SessionMeta } from '@shared/types'
import { type Conv, activate, addProject, isSubagent, newConv, openSession, removeProject, setPrefs, setView, trashSession, useApp } from './store'
import { Icon, baseName, relTime } from './ui'
import { t } from '@shared/i18n'

const VISIBLE = 6

interface Project {
  cwd: string
  sessions: SessionMeta[]
  drafts: Conv[]
  latest: number
}

export function Sidebar() {
  const sessions = useApp((s) => s.sessions)
  const convs = useApp((s) => s.convs)
  const activeKey = useApp((s) => s.activeKey)
  const extraProjects = useApp((s) => s.extraProjects)
  const view = useApp((s) => s.view)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const active = activeKey ? convs[activeKey] : undefined

  const projects = useMemo(() => {
    const map = new Map<string, Project>()
    const get = (cwd: string) => {
      let project = map.get(cwd)
      if (!project) map.set(cwd, (project = { cwd, sessions: [], drafts: [], latest: 0 }))
      return project
    }
    for (const meta of sessions) {
      if (!meta.cwd || isSubagent(meta)) continue
      const project = get(meta.cwd)
      project.sessions.push(meta)
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
  }, [sessions, convs, extraProjects])

  const runningFiles = new Set(Object.values(convs).filter((c) => c.streaming).map((c) => c.sessionFile ?? c.key))
  const unreadFiles = new Set(Object.values(convs).filter((c) => c.unread).map((c) => c.sessionFile ?? c.key))

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
      <button className={`nav-item ${view === 'images' ? 'active' : ''}`} title={t('所有对话生成过的图片')} onClick={() => setView(view === 'images' ? 'chat' : 'images')}>
        <Icon name="image" />
        {t('图片')}
      </button>
      <div className="sidebar-label">
        <span className="grow">{t('项目')}</span>
        <button className="icon-btn" title={t('添加项目文件夹，并在里面开始新对话')} onClick={() => void addProject()}>
          <Icon name="plus" size={14} />
        </button>
      </div>
      <div className="sidebar-scroll">
        {projects.map((project) => {
          const isCollapsed = collapsed[project.cwd]
          const showAll = expanded[project.cwd]
          const list = showAll ? project.sessions : project.sessions.slice(0, VISIBLE)
          return (
            <div key={project.cwd} className="project">
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
                  {list.map((meta) => {
                    const isActive = active && (active.key === meta.file || active.sessionFile === meta.file)
                    return (
                      <div key={meta.file} className={`session-row ${isActive ? 'active' : ''}`} onClick={() => void openSession(meta)}>
                        <span className="grow ellipsis">{meta.name ?? meta.firstUserText ?? t('（空对话）')}</span>
                        {runningFiles.has(meta.file) ? (
                          <span className="dot-running" />
                        ) : unreadFiles.has(meta.file) ? (
                          <span className="dot-unread" title={t('有新结果')} />
                        ) : (
                          <span className="session-time">{relTime(meta.modified)}</span>
                        )}
                        <button
                          className="icon-btn hover-only"
                          title={t('移到废纸篓')}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (window.confirm(`${t('把这个对话移到废纸篓？')}\n\n${meta.name ?? meta.firstUserText ?? ''}`)) void trashSession(meta)
                          }}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    )
                  })}
                  {project.sessions.length > VISIBLE && (
                    <div className="session-row muted" onClick={() => setExpanded({ ...expanded, [project.cwd]: !showAll })}>
                      {showAll ? t('收起') : t('显示全部 {n} 个', { n: project.sessions.length })}
                    </div>
                  )}
                  {!project.sessions.length && !project.drafts.length && (
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
    </aside>
  )
}
