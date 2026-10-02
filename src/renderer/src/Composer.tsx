import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CapKind, ModelInfo } from '@shared/types'
import { CapPanel, capCount } from './CapPanel'
import { type Conv, abort, addProject, ensureStarted, loadCaps, newConv, openSettings, projectDirs, send, setDraft, setModel, setThinking, useApp } from './store'
import { Icon, Popover, StatusDot, baseName } from './ui'

const THINKING_LABEL: Record<string, string> = { off: '关', minimal: '最低', low: '低', medium: '中', high: '高', xhigh: '很高', max: '最高' }

function ModelPicker({ conv, onClose }: { conv: Conv; onClose: () => void }) {
  const models = conv.info.models
  const authStatus = useApp((s) => s.authStatus)
  const authChecking = useApp((s) => s.authChecking)
  useEffect(() => ensureStarted(conv.key), [conv.key])
  const groups = useMemo(() => {
    const map = new Map<string, ModelInfo[]>()
    for (const model of models ?? []) map.set(model.provider, [...(map.get(model.provider) ?? []), model])
    return [...map.entries()]
  }, [models])
  return (
    <Popover onClose={onClose} className="menu" group="composer">
      {!models && <div className="menu-empty">{conv.error ? '模型列表读取失败' : '正在读取模型列表…'}</div>}
      {groups.map(([provider, list]) => (
        <div key={provider}>
          <div className="menu-label">
            <StatusDot state={authChecking[provider] ? 'checking' : (authStatus[provider]?.state ?? 'none')} title={authStatus[provider]?.message} />
            {provider}
            {authStatus[provider]?.state === 'invalid' && <span className="status-invalid">　已失效</span>}
          </div>
          {list.map((model) => {
            const current = conv.info.model?.id === model.id && conv.info.model?.provider === model.provider
            return (
              <button
                key={model.id}
                className="menu-item"
                onClick={() => {
                  void setModel(conv.key, model)
                  onClose()
                }}
              >
                <span className="grow ellipsis">{model.name ?? model.id}</span>
                {current && <Icon name="check" size={14} />}
              </button>
            )
          })}
        </div>
      ))}
      <div className="menu-sep" />
      <button
        className="menu-item"
        onClick={() => {
          onClose()
          openSettings('accounts')
        }}
      >
        <Icon name="plus" size={14} />
        添加模型…
      </button>
    </Popover>
  )
}

function ThinkingPicker({ conv, onClose }: { conv: Conv; onClose: () => void }) {
  useEffect(() => ensureStarted(conv.key), [conv.key])
  const levels = conv.info.thinkingLevels
  return (
    <Popover onClose={onClose} className="menu narrow" group="composer">
      {!levels && <div className="menu-empty">正在读取…</div>}
      {levels?.map((level) => (
        <button
          key={level}
          className="menu-item"
          onClick={() => {
            void setThinking(conv.key, level)
            onClose()
          }}
        >
          <span className="grow">{THINKING_LABEL[level] ?? level}</span>
          {conv.info.thinkingLevel === level && <Icon name="check" size={14} />}
        </button>
      ))}
    </Popover>
  )
}

/** 换一个项目，或者添加新的项目文件夹。只在还没发过消息的新对话里能用 */
function ProjectMenu({ conv, onClose }: { conv: Conv; onClose: () => void }) {
  const sessions = useApp((s) => s.sessions)
  const extraProjects = useApp((s) => s.extraProjects)
  const convs = useApp((s) => s.convs)
  const dirs = useMemo(() => projectDirs({ sessions, extraProjects, convs }), [sessions, extraProjects, convs])
  return (
    <Popover onClose={onClose} className="menu" group="composer">
      <div className="menu-label">在哪个项目里开始</div>
      {dirs.map((dir) => (
        <button
          key={dir}
          className="menu-item"
          title={dir}
          onClick={() => {
            onClose()
            newConv(dir)
          }}
        >
          <Icon name="folder" size={14} />
          <span className="grow ellipsis">{baseName(dir)}</span>
          {dir === conv.cwd && <Icon name="check" size={14} />}
        </button>
      ))}
      <div className="menu-sep" />
      <button
        className="menu-item"
        onClick={() => {
          onClose()
          void addProject()
        }}
      >
        <Icon name="plus" size={14} />
        添加文件夹…
      </button>
    </Popover>
  )
}

type Open = CapKind | 'model' | 'thinking' | 'project'

const CAP_BUTTONS: { kind: CapKind; label: string; icon: string }[] = [
  { kind: 'skill', label: '技能', icon: 'spark' },
  { kind: 'mcp', label: 'MCP', icon: 'plug' },
  { kind: 'tool', label: '工具', icon: 'tool' }
]

export function Composer({ conv }: { conv: Conv }) {
  const defaults = useApp((s) => s.defaults)
  const [open, setOpen] = useState<Open | undefined>()
  const input = useRef<HTMLTextAreaElement>(null)
  const toggle = (target: Open) => setOpen(open === target ? undefined : target)
  const close = () => setOpen(undefined)

  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`
  }, [conv.draft, conv.key])

  useEffect(() => {
    input.current?.focus()
    setOpen(undefined)
    void loadCaps(conv.key)
  }, [conv.key])

  const model = conv.info.model
  const modelLabel = model?.name ?? model?.id ?? defaults?.defaultModel ?? '选择模型'
  const thinking = conv.info.thinkingLevel ?? defaults?.defaultThinkingLevel
  const widgets = Object.entries(conv.widgets)
  // MCP 的连接数小栏里已经有了，扩展自己报的那条不重复显示
  const statuses = Object.entries(conv.statuses)
    .filter(([key]) => key !== 'mcp')
    .map(([, text]) => text)
  const canSend = conv.draft.trim().length > 0
  // 发过消息的对话已经绑定在它的项目上，不能再换
  const canSwitchProject = !conv.messages.length && !conv.pending.length && !conv.streaming && !conv.loading

  return (
    <div className="composer-wrap">
      {(open === 'skill' || open === 'mcp' || open === 'tool') && <CapPanel conv={conv} kind={open} onClose={close} />}
      {conv.queue.length > 0 && (
        <div className="queue">
          {conv.queue.map((text, index) => (
            <div key={index} className="queue-item ellipsis">
              排队中：{text}
            </div>
          ))}
        </div>
      )}
      {widgets.map(([key, lines]) => (
        <pre key={key} className="widget">
          {lines.join('\n')}
        </pre>
      ))}
      {/* 输入框里只留模型和发送，其它功能放在下面那条小栏里 */}
      <div className="composer">
        <textarea
          ref={input}
          rows={1}
          value={conv.draft}
          placeholder={conv.streaming ? '继续补充，会在当前这一步之后送达' : '问点什么，或者交代一件事'}
          onChange={(event) => setDraft(conv.key, event.target.value)}
          onKeyDown={(event) => {
            // 输入法正在选字时的回车是确认候选词，不是发送
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault()
              void send(conv.key)
            }
          }}
        />
        <div className="composer-bar">
          <span className="grow" />
          <div className="anchor">
            <button className="chip" data-popover-trigger="composer" onClick={() => toggle('model')}>
              <span className="ellipsis">{modelLabel}</span>
              <Icon name="down" size={11} />
            </button>
            {open === 'model' && <ModelPicker conv={conv} onClose={close} />}
          </div>
          <div className="anchor">
            <button className="chip" data-popover-trigger="composer" onClick={() => toggle('thinking')}>
              推理 {thinking ? (THINKING_LABEL[thinking] ?? thinking) : '默认'}
              <Icon name="down" size={11} />
            </button>
            {open === 'thinking' && <ThinkingPicker conv={conv} onClose={close} />}
          </div>
          {conv.streaming && (
            <button className="round-btn stop" title="停止" onClick={() => abort(conv.key)}>
              <Icon name="stop" />
            </button>
          )}
          {(!conv.streaming || canSend) && (
            <button className="round-btn" title="发送" disabled={!canSend} onClick={() => void send(conv.key)}>
              <Icon name="up" />
            </button>
          )}
        </div>
      </div>
      <div className="composer-strip">
        <div className="anchor">
          <button className="strip-btn" data-popover-trigger="composer" title={conv.cwd} disabled={!canSwitchProject} onClick={() => toggle('project')}>
            <Icon name="folder" size={14} />
            <span className="ellipsis">{baseName(conv.cwd)}</span>
            {canSwitchProject && <Icon name="down" size={10} />}
          </button>
          {open === 'project' && <ProjectMenu conv={conv} onClose={close} />}
        </div>
        {CAP_BUTTONS.map((button) => {
          const count = capCount(conv.caps?.items, button.kind)
          return (
            <button key={button.kind} data-popover-trigger="composer" className={`strip-btn ${open === button.kind ? 'active' : ''}`} onClick={() => toggle(button.kind)}>
              <Icon name={button.icon} size={14} />
              {button.label}
              {count !== undefined && <span className="strip-count">{count}</span>}
            </button>
          )
        })}
        <span className="grow" />
        {conv.caps?.dirty ? <span className="strip-note accent">改动从下一条消息起生效</span> : statuses.length > 0 && <span className="strip-note ellipsis">{statuses.join('　')}</span>}
      </div>
    </div>
  )
}
