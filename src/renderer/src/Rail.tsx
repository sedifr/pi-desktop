import { useState } from 'react'
import type { CapKind } from '@shared/types'
import { t } from '@shared/i18n'
import { CapPanel } from './CapPanel'
import { type Conv, openSettings } from './store'
import { Icon } from './ui'

const ITEMS: { kind: CapKind; icon: string; title: string }[] = [
  { kind: 'skill', icon: 'spark', title: t('技能：这次对话能用哪些技能') },
  { kind: 'mcp', icon: 'plug', title: t('MCP：这次对话接哪些外部服务') },
  { kind: 'tool', icon: 'tool', title: t('工具：这次对话 AI 能用哪些工具和扩展') }
]

/**
 * 聊天区左边的一小列图标。技能、MCP、工具、插件市场各占一个：它们管的是「这次对话带什么能力」，
 * 和输入框本身（写字、附文件、选模型）是两回事，所以不挤在输入框里。点一个图标，旁边弹出它那一类。
 */
export function Rail({ conv }: { conv: Conv }) {
  const [open, setOpen] = useState<CapKind>()
  return (
    <nav className="rail">
      {ITEMS.map((item) => (
        <button
          key={item.kind}
          className={`rail-btn ${open === item.kind ? 'active' : ''}`}
          data-popover-trigger="rail"
          title={item.title}
          onClick={() => setOpen(open === item.kind ? undefined : item.kind)}
        >
          <Icon name={item.icon} size={16} />
        </button>
      ))}
      <span className="rail-sep" />
      <button className="rail-btn" title={t('插件市场：找别人做好的技能和扩展')} onClick={() => openSettings('market')}>
        <Icon name="store" size={16} />
      </button>
      {open && <CapPanel rail conv={conv} kind={open} onKind={setOpen} onClose={() => setOpen(undefined)} />}
    </nav>
  )
}
