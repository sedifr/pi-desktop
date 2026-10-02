import { useEffect, useMemo, useState } from 'react'
import type { CapItem, CapKind, CapState } from '@shared/types'
import { type Conv, changeCaps, loadCaps, resetCaps, saveCapsAs } from './store'
import { Icon, Popover } from './ui'

const LABEL: Record<CapState, string> = { auto: '自动', on: '开', off: '关' }
const KIND_TITLE: Record<CapKind, string> = { skill: '技能', mcp: 'MCP', tool: '工具' }
const KIND_HINT: Record<CapKind, string> = {
  skill: '点一下切换：自动 → 开 → 关',
  mcp: '点一下开关。关掉的服务这次对话不连接',
  tool: '点一下开关。关掉的工具这次对话 AI 用不了'
}

export function nextState(item: CapItem): CapState {
  if (!item.tri) return item.state === 'off' ? 'on' : 'off'
  return item.state === 'auto' ? 'on' : item.state === 'on' ? 'off' : 'auto'
}

/** 某一类里开着的有几个；列表还没读到时返回 undefined */
export function capCount(items: CapItem[] | undefined, kind: CapKind): number | undefined {
  return items?.filter((item) => item.kind === kind && item.state !== 'off').length
}

export function Tile({ item, onToggle }: { item: CapItem; onToggle: () => void }) {
  return (
    <button className={`cap-tile state-${item.state}`} title={item.description || item.summary} onClick={onToggle}>
      <span className="cap-text">
        <span className="cap-name ellipsis">{item.name}</span>
        {item.summary && <span className="cap-desc ellipsis">{item.summary}</span>}
      </span>
      <span className="cap-state">{LABEL[item.state]}</span>
    </button>
  )
}

/** 输入栏下面那条小栏里，技能 / MCP / 工具各自点开的面板，只显示自己那一类 */
export function CapPanel({ conv, kind, onClose }: { conv: Conv; kind: CapKind; onClose: () => void }) {
  const [query, setQuery] = useState('')
  useEffect(() => {
    void loadCaps(conv.key)
  }, [conv.key])

  const all = conv.caps?.items
  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (all ?? []).filter((item) => item.kind === kind)
    return q ? list.filter((item) => `${item.name} ${item.summary} ${item.description ?? ''}`.toLowerCase().includes(q)) : list
  }, [all, kind, query])

  const toggle = (item: CapItem) => void changeCaps(conv.key, { [item.id]: nextState(item) })
  const setAllSkills = (target: 'auto' | 'off') => {
    const changes: Record<string, CapState> = {}
    for (const item of all ?? []) if (item.kind === 'skill') changes[item.id] = target
    void changeCaps(conv.key, changes)
  }

  const on = items.filter((item) => item.state !== 'off')
  const off = items.filter((item) => item.state === 'off')
  const hasOverrides = all?.some((item) => item.from === 'session')
  const wide = kind === 'skill'

  return (
    <Popover onClose={onClose} group="composer" className={`cap-panel ${wide ? '' : 'compact'}`}>
      <div className="cap-head">
        <span className="cap-title">{KIND_TITLE[kind]}</span>
        <span className="muted small">{KIND_HINT[kind]}</span>
        <span className="grow" />
        {wide && (
          <label className="cap-search">
            <Icon name="search" size={13} />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜名字或用途" />
          </label>
        )}
      </div>
      {!all ? (
        <div className="cap-empty">正在读取…</div>
      ) : (
        <div className="cap-col">
          {wide && (
            <div className="cap-section">
              <span className="muted small">开着的（{on.length}）</span>
              <span className="grow" />
              <button className="link-btn" onClick={() => setAllSkills('auto')}>
                全部交给 AI
              </button>
              <button className="link-btn" onClick={() => setAllSkills('off')}>
                全部关掉
              </button>
            </div>
          )}
          <div className={`cap-grid ${wide ? '' : 'one'}`}>
            {(wide ? on : items).map((item) => (
              <Tile key={item.id} item={item} onToggle={() => toggle(item)} />
            ))}
          </div>
          {wide && off.length > 0 && (
            <>
              <div className="cap-section muted small">没开的（{off.length}）</div>
              <div className="cap-grid">
                {off.map((item) => (
                  <Tile key={item.id} item={item} onToggle={() => toggle(item)} />
                ))}
              </div>
            </>
          )}
          {!items.length && <div className="cap-empty">{query ? '没有匹配的项' : '这里还没有东西'}</div>}
        </div>
      )}
      <div className="cap-foot">
        <span className="muted small grow">{conv.caps?.dirty ? '改动会从下一条消息起生效' : '这里的改动只影响这次对话'}</span>
        {hasOverrides && (
          <button className="link-btn" onClick={() => void resetCaps(conv.key)}>
            恢复默认
          </button>
        )}
        <button className="link-btn" title="技能、MCP、工具现在的开关一起存为这个项目的默认" onClick={() => void saveCapsAs(conv.key, 'project')}>
          设为本项目默认
        </button>
        <button className="link-btn" title="技能、MCP、工具现在的开关一起存为所有项目的默认" onClick={() => void saveCapsAs(conv.key, 'global')}>
          设为全局默认
        </button>
      </div>
    </Popover>
  )
}
