/**
 * 自己加的按钮。界面上划出几个位置（挂载位），用户往里面放按钮：放哪、叫什么、按下去做什么都自己定。
 * 存成桌面端文件夹里的 buttons.json，所以手改、让 Pi 改、从别人那里拿都行；应用盯着这个文件，改完马上生效。
 * 默认一个按钮都没有。
 */

/** 能放按钮的位置 */
export const BUTTON_SLOTS = ['composer.above', 'composer.bar', 'rail', 'header', 'sidebar', 'welcome'] as const
export type ButtonSlot = (typeof BUTTON_SLOTS)[number]

/** 界面上现成的功能，可以原样搬成一个按钮 */
export const APP_ACTIONS = [
  'new',
  'newWindow',
  'addProject',
  'search',
  'find',
  'commands',
  'model',
  'compact',
  'copyLast',
  'export',
  'rename',
  'stop',
  'minimal',
  'pane:files',
  'pane:changes',
  'pane:browser',
  'pane:terminal',
  'togglePane',
  'toggleSidebar',
  'images',
  'market',
  'settings'
] as const
export type AppAction = (typeof APP_ACTIONS)[number]

export const ACCESS_LEVELS = ['read', 'edit', 'full'] as const
export type AccessLevel = (typeof ACCESS_LEVELS)[number]

export type ButtonAction =
  /** 说一段话。send 为真直接发出去，否则放进输入框等你补完。开头写 /名字 就是用一条快捷指令或技能 */
  | { type: 'prompt'; text: string; send?: boolean }
  /** 直接运行一条命令，输出显示在对话里。quiet 为真时结果不带给 Pi */
  | { type: 'shell'; command: string; quiet?: boolean }
  /** 打开一个网址（在右侧面板的浏览器里）、文件或文件夹 */
  | { type: 'open'; target: string }
  /** 界面上现成的一个功能 */
  | { type: 'app'; do: AppAction }
  /** 把这次对话切到某个模型、推理档位、权限档位，写了哪项切哪项 */
  | { type: 'set'; model?: string; thinking?: string; access?: AccessLevel }

export interface UserButton {
  id: string
  label: string
  /** 自带图标的名字，或者一两个字、一个表情 */
  icon?: string
  slot: ButtonSlot
  action: ButtonAction
}

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '')

function cleanAction(raw: unknown): ButtonAction | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const action = raw as Record<string, unknown>
  switch (action.type) {
    case 'prompt': {
      const body = text(action.text, 20_000)
      return body.trim() ? { type: 'prompt', text: body, send: action.send === true } : undefined
    }
    case 'shell': {
      const command = text(action.command, 4000)
      return command.trim() ? { type: 'shell', command, quiet: action.quiet === true } : undefined
    }
    case 'open': {
      const target = text(action.target, 2000).trim()
      return target ? { type: 'open', target } : undefined
    }
    case 'app':
      return (APP_ACTIONS as readonly unknown[]).includes(action.do) ? { type: 'app', do: action.do as AppAction } : undefined
    case 'set': {
      const model = text(action.model, 200).trim()
      const thinking = text(action.thinking, 40).trim()
      const access = (ACCESS_LEVELS as readonly unknown[]).includes(action.access) ? (action.access as AccessLevel) : undefined
      if (!model && !thinking && !access) return undefined
      return { type: 'set', ...(model ? { model } : {}), ...(thinking ? { thinking } : {}), ...(access ? { access } : {}) }
    }
    default:
      return undefined
  }
}

/**
 * 从文件里读出来的东西里挑出写对了的按钮。这个文件人和 Pi 都会改，写错的那几个跳过，不能让它们拖垮界面。
 * 文件可以是 { "buttons": [...] }，也可以直接是一个数组。
 */
export function cleanButtons(raw: unknown): UserButton[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { buttons?: unknown }).buttons) ? (raw as { buttons: unknown[] }).buttons : []
  const seen = new Set<string>()
  const out: UserButton[] = []
  for (const item of list.slice(0, 200)) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const action = cleanAction(entry.action)
    const label = text(entry.label, 40).trim()
    const icon = text(entry.icon, 16).trim()
    if (!action || (!label && !icon)) continue
    // 没写编号或者重了，按位置给一个：同一个文件每次读出来的编号是稳定的
    let id = text(entry.id, 60).replace(/[^\w-]/g, '')
    if (!id || seen.has(id)) id = `b${out.length + 1}`
    while (seen.has(id)) id += 'x'
    seen.add(id)
    out.push({
      id,
      label,
      ...(icon ? { icon } : {}),
      slot: (BUTTON_SLOTS as readonly unknown[]).includes(entry.slot) ? (entry.slot as ButtonSlot) : 'composer.above',
      action
    })
  }
  return out
}
