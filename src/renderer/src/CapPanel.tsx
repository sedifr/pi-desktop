import { useEffect, useMemo, useState } from 'react'
import type { CapItem, CapKind, CapState } from '@shared/types'
import { type Conv, api, changeCaps, errorText, loadCaps, openSettings, resetCaps, saveCapsAs, toast } from './store'
import { Icon, Popover } from './ui'
import { t } from '@shared/i18n'

const LABEL: Record<CapState, string> = { auto: t('自动'), on: t('开'), off: t('关') }
const KIND_TITLE: Record<CapKind, string> = { skill: t('技能'), mcp: 'MCP', tool: t('工具') }
const KIND_HINT: Record<CapKind, string> = {
  skill: t('点一下切换：自动 → 开 → 关'),
  mcp: t('点一下开关。关掉的服务这次对话不连接'),
  tool: t('点一下开关。关掉的工具这次对话 AI 用不了')
}

export function nextState(item: CapItem): CapState {
  if (!item.tri) return item.state === 'off' ? 'on' : 'off'
  return item.state === 'auto' ? 'on' : item.state === 'on' ? 'off' : 'auto'
}

/** 某一类里开着的有几个；列表还没读到时返回 undefined */
export function capCount(items: CapItem[] | undefined, kind: CapKind): number | undefined {
  return items?.filter((item) => item.kind === kind && item.state !== 'off').length
}

/** 自带的四个工具的名字和说明跟着界面语言走，不让改 */
const FIXED = new Set(['tool:read', 'tool:bash', 'tool:edit', 'tool:write'])

/**
 * 一项技能、MCP 或工具。点一下切换状态；传了 onEdit 时，悬停会出现一支笔，
 * 可以把那句简介改成自己记得住的话。
 */
export function Tile({ item, onToggle, onEdit }: { item: CapItem; onToggle: () => void; onEdit?: (summary: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  if (editing) {
    return (
      <div className="cap-tile editing">
        <span className="cap-text">
          <span className="cap-name ellipsis">{item.name}</span>
          <input
            autoFocus
            className="cap-edit"
            value={value}
            placeholder={t('用一句话写下它是干什么的。留空就用它自带的说明')}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key !== 'Enter' && event.key !== 'Escape') return
              // 这两个键在这里只管这个输入框，不要顺带把面板或设置页关掉
              event.stopPropagation()
              event.nativeEvent.stopPropagation()
              if (event.key === 'Enter' && value.trim() !== item.summary) onEdit?.(value.trim())
              setEditing(false)
            }}
          />
        </span>
      </div>
    )
  }
  return (
    <div
      role="button"
      tabIndex={0}
      className={`cap-tile state-${item.state}`}
      title={item.description || item.summary}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
    >
      <span className="cap-text">
        <span className="cap-name ellipsis">{item.name}</span>
        {item.summary && <span className="cap-desc ellipsis">{item.summary}</span>}
      </span>
      {onEdit && !FIXED.has(item.id) && (
        <button
          className="cap-pen"
          tabIndex={-1}
          title={t('改这句简介')}
          onClick={(event) => {
            event.stopPropagation()
            setValue(item.summary)
            setEditing(true)
          }}
        >
          <Icon name="edit" size={12} />
        </button>
      )}
      <span className="cap-state">{LABEL[item.state]}</span>
    </div>
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
  const edit = (item: CapItem, summary: string) =>
    void api.summarySet(item.id, summary).then(
      () => loadCaps(conv.key),
      (error) => toast(errorText(error), 'error')
    )
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
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('搜名字或用途')} />
          </label>
        )}
      </div>
      {!all ? (
        <div className="cap-empty">{t('正在读取…')}</div>
      ) : (
        <div className="cap-col">
          {wide && (
            <div className="cap-section">
              <span className="muted small">{t('开着的（{n}）', { n: on.length })}</span>
              <span className="grow" />
              <button className="link-btn" onClick={() => setAllSkills('auto')}>
                {t('全部交给 AI')}
              </button>
              <button className="link-btn" onClick={() => setAllSkills('off')}>
                {t('全部关掉')}
              </button>
            </div>
          )}
          <div className={`cap-grid ${wide ? '' : 'one'}`}>
            {(wide ? on : items).map((item) => (
              <Tile key={item.id} item={item} onToggle={() => toggle(item)} onEdit={(summary) => edit(item, summary)} />
            ))}
          </div>
          {wide && off.length > 0 && (
            <>
              <div className="cap-section muted small">{t('没开的（{n}）', { n: off.length })}</div>
              <div className="cap-grid">
                {off.map((item) => (
                  <Tile key={item.id} item={item} onToggle={() => toggle(item)} onEdit={(summary) => edit(item, summary)} />
                ))}
              </div>
            </>
          )}
          {!items.length && <div className="cap-empty">{query ? t('没有匹配的项') : t('这里还没有东西')}</div>}
        </div>
      )}
      <div className="cap-foot">
        <span className="muted small grow">{conv.caps?.dirty ? t('改动会从下一条消息起生效') : t('这里的改动只影响这次对话')}</span>
        {kind === 'mcp' && (
          <button
            className="link-btn"
            onClick={() => {
              onClose()
              openSettings('mcp')
            }}
          >
            {t('添加或管理服务…')}
          </button>
        )}
        {hasOverrides && (
          <button className="link-btn" onClick={() => void resetCaps(conv.key)}>
            {t('恢复默认')}
          </button>
        )}
        <button className="link-btn" title={t('技能、MCP、工具现在的开关一起存为这个项目的默认')} onClick={() => void saveCapsAs(conv.key, 'project')}>
          {t('设为本项目默认')}
        </button>
        <button className="link-btn" title={t('技能、MCP、工具现在的开关一起存为所有项目的默认')} onClick={() => void saveCapsAs(conv.key, 'global')}>
          {t('设为全局默认')}
        </button>
      </div>
    </Popover>
  )
}
