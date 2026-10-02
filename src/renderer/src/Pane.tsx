import { useEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import { Browser } from './Browser'
import { Changes } from './Changes'
import { type Conv, type PaneTab, setPrefs, useApp } from './store'
import { TerminalView } from './Terminal'
import { Icon } from './ui'

const TABS: { id: PaneTab; label: string; icon: string }[] = [
  { id: 'changes', label: t('改动'), icon: 'diff' },
  { id: 'browser', label: t('浏览器'), icon: 'globe' },
  { id: 'terminal', label: t('终端'), icon: 'terminal' }
]

const MIN_WIDTH = 320

/**
 * 聊天框右边的面板：改动的文件、内置浏览器、终端，用上面的页签切换。
 * 三页都一直留着不销毁，只是把没在看的藏起来——网页不用重新加载，终端里的内容也还在。
 */
export function Pane({ conv, visible: open }: { conv: Conv; visible: boolean }) {
  const tab = useApp((s) => s.prefs.paneTab)
  const width = useApp((s) => s.prefs.paneWidth)
  const box = useRef<HTMLDivElement>(null)
  // 每个项目文件夹一个终端。看过哪个项目的终端，就一直给它留着
  const [terminals, setTerminals] = useState<string[]>([])
  const wantTerminal = open && tab === 'terminal'
  useEffect(() => {
    if (wantTerminal) setTerminals((current) => (current.includes(conv.cwd) ? current : [...current, conv.cwd]))
  }, [wantTerminal, conv.cwd])

  // 拖左边那条细线改宽度
  const startDrag = (event: React.MouseEvent) => {
    event.preventDefault()
    const right = box.current?.getBoundingClientRect().right ?? window.innerWidth
    const move = (e: MouseEvent) => {
      const next = Math.min(Math.max(right - e.clientX, MIN_WIDTH), Math.max(MIN_WIDTH, window.innerWidth * 0.62))
      if (box.current) box.current.style.width = `${next}px`
    }
    const up = (e: MouseEvent) => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.classList.remove('dragging')
      setPrefs({ paneWidth: Math.round(Math.min(Math.max(right - e.clientX, MIN_WIDTH), Math.max(MIN_WIDTH, window.innerWidth * 0.62))) })
    }
    document.body.classList.add('dragging')
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return (
    <aside className={`pane ${open ? '' : 'closed'}`} ref={box} style={{ width }}>
      <div className="pane-handle" onMouseDown={startDrag} />
      <header className="pane-head">
        <div className="segmented no-drag">
          {TABS.map((item) => (
            <button key={item.id} className={tab === item.id ? 'on' : ''} onClick={() => setPrefs({ paneTab: item.id })}>
              <Icon name={item.icon} size={13} />
              {item.label}
            </button>
          ))}
        </div>
        <span className="grow" />
        <button className="icon-btn no-drag" title={t('收起右侧面板（⌥⌘B）')} onClick={() => setPrefs({ paneOpen: false })}>
          <Icon name="x" size={14} />
        </button>
      </header>
      <div className="pane-body">
        <div className={`pane-page ${tab === 'changes' ? 'on' : ''}`}>{tab === 'changes' && open && <Changes conv={conv} />}</div>
        <div className={`pane-page ${tab === 'browser' ? 'on' : ''}`}>
          <Browser />
        </div>
        <div className={`pane-page ${tab === 'terminal' ? 'on' : ''}`}>
          {terminals.map((cwd) => (
            <TerminalView key={cwd} cwd={cwd} active={wantTerminal && cwd === conv.cwd} />
          ))}
        </div>
      </div>
    </aside>
  )
}
