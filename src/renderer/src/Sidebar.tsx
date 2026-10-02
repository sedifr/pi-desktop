import { useMemo, useState } from 'react'
import type { SessionMeta } from '@shared/types'
import { type Conv, activate, addProject, newConv, openSession, removeProject, setView, trashSession, useApp } from './store'
import { Icon, baseName, relTime } from './ui'

const VISIBLE = 6
/** 子 Agent 自己的会话（名字形如 Explore#d0c8da8a），不在列表里占位置 */
const isSubagent = (meta: SessionMeta) => /#[0-9a-f]{8}$/.test(meta.name ?? '')

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

  return (
    <aside className="sidebar">
      <div className="sidebar-drag" />
      <button className="nav-item" onClick={() => (active ? newConv(active.cwd) : projects[0] ? newConv(projects[0].cwd) : void addProject())}>
        <Icon name="edit" />
        新对话
      </button>
      <div className="sidebar-label">
        <span className="grow">项目</span>
        <button className="icon-btn" title="添加项目文件夹，并在里面开始新对话" onClick={() => void addProject()}>
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
                  title="在这个项目里新建对话"
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
                      <span className="grow ellipsis">{conv.title ?? '新对话'}</span>
                      {conv.streaming && <span className="dot-running" />}
                    </div>
                  ))}
                  {list.map((meta) => {
                    const isActive = active && (active.key === meta.file || active.sessionFile === meta.file)
                    return (
                      <div key={meta.file} className={`session-row ${isActive ? 'active' : ''}`} onClick={() => void openSession(meta)}>
                        <span className="grow ellipsis">{meta.name ?? meta.firstUserText ?? '（空对话）'}</span>
                        {runningFiles.has(meta.file) ? <span className="dot-running" /> : <span className="session-time">{relTime(meta.modified)}</span>}
                        <button
                          className="icon-btn hover-only"
                          title="移到废纸篓"
                          onClick={(event) => {
                            event.stopPropagation()
                            if (window.confirm(`把这个对话移到废纸篓？\n\n${meta.name ?? meta.firstUserText ?? ''}`)) void trashSession(meta)
                          }}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    )
                  })}
                  {project.sessions.length > VISIBLE && (
                    <div className="session-row muted" onClick={() => setExpanded({ ...expanded, [project.cwd]: !showAll })}>
                      {showAll ? '收起' : `显示全部 ${project.sessions.length} 个`}
                    </div>
                  )}
                  {!project.sessions.length && !project.drafts.length && (
                    <div className="session-row muted">
                      <span className="grow">还没有对话</span>
                      <button
                        className="link-btn"
                        title="只是从列表里拿掉，不会删除文件夹"
                        onClick={(event) => {
                          event.stopPropagation()
                          removeProject(project.cwd)
                        }}
                      >
                        移除
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
        设置
      </button>
    </aside>
  )
}
