import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import type { CapKind, CapState, ImageAttachment, ModelInfo } from '@shared/types'
import { CapPanel, capCount } from './CapPanel'
import {
  type Conv,
  abort,
  addAttachments,
  addProject,
  api,
  changeCaps,
  ensureStarted,
  loadCaps,
  newConv,
  openSettings,
  projectDirs,
  removeAttachment,
  runCommand,
  send,
  setDraft,
  setModel,
  setThinking,
  toast,
  useApp
} from './store'
import { TrustBanner } from './Trust'
import { Icon, Popover, StatusDot, baseName } from './ui'

const THINKING_LABEL: Record<string, string> = { off: t('关'), minimal: t('最低'), low: t('低'), medium: t('中'), high: t('高'), xhigh: t('很高'), max: t('最高') }

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
      {!models && <div className="menu-empty">{conv.error ? t('模型列表读取失败') : t('正在读取模型列表…')}</div>}
      {groups.map(([provider, list]) => (
        <div key={provider}>
          <div className="menu-label">
            <StatusDot state={authChecking[provider] ? 'checking' : (authStatus[provider]?.state ?? 'none')} title={authStatus[provider]?.message} />
            {provider}
            {authStatus[provider]?.state === 'invalid' && <span className="status-invalid">　{t('已失效')}</span>}
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
        {t('添加模型…')}
      </button>
    </Popover>
  )
}

function ThinkingPicker({ conv, onClose }: { conv: Conv; onClose: () => void }) {
  useEffect(() => ensureStarted(conv.key), [conv.key])
  const levels = conv.info.thinkingLevels
  return (
    <Popover onClose={onClose} className="menu narrow" group="composer">
      {!levels && <div className="menu-empty">{t('正在读取…')}</div>}
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
      <div className="menu-label">{t('在哪个项目里开始')}</div>
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
        {t('添加文件夹…')}
      </button>
    </Popover>
  )
}

// ---- 权限档位 ----

type Access = 'read' | 'edit' | 'full' | 'custom'
const ACCESS_TOOLS = ['read', 'bash', 'edit', 'write']
const ACCESS_PRESETS: { id: Exclude<Access, 'custom'>; label: string; hint: string; on: string[] }[] = [
  { id: 'read', label: t('只读'), hint: t('只能读文件，不能改文件，也不能运行命令'), on: ['read'] },
  { id: 'edit', label: t('可改文件'), hint: t('能读、改、写文件，不能运行命令'), on: ['read', 'edit', 'write'] },
  { id: 'full', label: t('完全访问'), hint: t('能读写文件，也能运行命令'), on: ['read', 'bash', 'edit', 'write'] }
]

/** 从四个内置工具的开关看出现在是哪一档 */
function accessOf(conv: Conv): Access | undefined {
  const items = conv.caps?.items
  if (!items) return undefined
  const on = ACCESS_TOOLS.filter((name) => items.find((item) => item.id === `tool:${name}`)?.state !== 'off')
  return ACCESS_PRESETS.find((preset) => preset.on.length === on.length && preset.on.every((name) => on.includes(name)))?.id ?? 'custom'
}

function AccessMenu({ conv, current, onClose }: { conv: Conv; current: Access | undefined; onClose: () => void }) {
  return (
    <Popover onClose={onClose} className="menu wide" group="composer">
      {ACCESS_PRESETS.map((preset) => (
        <button
          key={preset.id}
          className="menu-item two-line"
          onClick={() => {
            const changes: Record<string, CapState> = {}
            for (const name of ACCESS_TOOLS) changes[`tool:${name}`] = preset.on.includes(name) ? 'on' : 'off'
            void changeCaps(conv.key, changes)
            onClose()
          }}
        >
          <span className="grow">
            {preset.label}
            <span className="menu-hint">{preset.hint}</span>
          </span>
          {current === preset.id && <Icon name="check" size={14} />}
        </button>
      ))}
      <div className="menu-sep" />
      <div className="menu-note">{t('这里只管 Pi 自带的读、改、写、运行四个工具。扩展和 MCP 带来的工具要到「工具」「MCP」里单独关。')}</div>
    </Popover>
  )
}

// ---- 快捷指令和 @ 文件 ----

interface Command {
  name: string
  description: string
  kind: 'native' | 'prompt' | 'skill' | 'extension'
  /** 选中后直接执行，不用再补参数 */
  immediate?: boolean
  hint?: string
}

const KIND_LABEL: Record<Command['kind'], string> = { native: t('桌面端'), prompt: t('我的指令'), skill: t('技能'), extension: t('扩展') }

const NATIVE: Command[] = [
  { name: 'new', description: t('开一个新对话'), kind: 'native', immediate: true },
  { name: 'compact', description: t('压缩上下文，后面可以写压缩时要保留什么'), kind: 'native' },
  { name: 'name', description: t('给这个对话改名'), kind: 'native', hint: t('<名字>') },
  { name: 'export', description: t('把这个对话导出成网页'), kind: 'native', immediate: true },
  { name: 'copy', description: t('复制上一条回答'), kind: 'native', immediate: true },
  { name: 'settings', description: t('打开设置'), kind: 'native', immediate: true }
]

function commandsOf(conv: Conv): Command[] {
  const summaries = new Map((conv.caps?.items ?? []).filter((item) => item.kind === 'skill').map((item) => [item.name, item.summary]))
  const fromPi: Command[] = (conv.info.commands ?? []).map((command) => {
    const kind = command.source === 'prompt' ? 'prompt' : command.source === 'skill' ? 'skill' : 'extension'
    const skillName = command.name.replace(/^skill:/, '')
    return {
      name: command.name,
      // 技能自带的说明是写给模型看的长句，这里用界面上那句简介
      description: (kind === 'skill' ? summaries.get(skillName) : undefined) ?? (command.description ?? '').split('\n')[0],
      kind,
      hint: command.argumentHint
    }
  })
  const order: Command['kind'][] = ['prompt', 'native', 'skill', 'extension']
  return [...NATIVE, ...fromPi].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
}

function readImage(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve({ name: file.name || 'image', mimeType: file.type, data: String(reader.result).split(',')[1] ?? '' })
    reader.readAsDataURL(file)
  })
}

type Open = CapKind | 'model' | 'thinking' | 'project' | 'access'

const CAP_BUTTONS: { kind: CapKind; label: string; icon: string }[] = [
  { kind: 'skill', label: t('技能'), icon: 'spark' },
  { kind: 'mcp', label: 'MCP', icon: 'plug' },
  { kind: 'tool', label: t('工具'), icon: 'tool' }
]

export function Composer({ conv }: { conv: Conv }) {
  const defaults = useApp((s) => s.defaults)
  const signal = useApp((s) => s.signal)
  const [open, setOpen] = useState<Open | undefined>()
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState(0)
  const [dismissed, setDismissed] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const input = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const nextCursor = useRef<number | undefined>(undefined)
  const toggle = (target: Open) => setOpen(open === target ? undefined : target)
  const close = () => setOpen(undefined)

  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`
    // 选中指令或文件后，把光标放到插入内容的后面
    if (nextCursor.current !== undefined) {
      el.setSelectionRange(nextCursor.current, nextCursor.current)
      setCursor(nextCursor.current)
      nextCursor.current = undefined
    }
  }, [conv.draft, conv.key])

  useEffect(() => {
    input.current?.focus()
    setOpen(undefined)
    setDismissed('')
    void loadCaps(conv.key)
  }, [conv.key])

  // 整个输入框只有一个以 / 开头的词时，是在选指令
  const slash = /^\/(\S*)$/.exec(conv.draft)
  const slashQuery = slash?.[1]
  // 光标前面是 @ 加一段不含空格的字时，是在找文件
  const mention = slash ? null : /(?:^|\s)@([^\s@]*)$/.exec(conv.draft.slice(0, cursor))
  const fileQuery = mention?.[1]
  const menuKey = slashQuery !== undefined ? `/${slashQuery}` : fileQuery !== undefined ? `@${fileQuery}` : ''
  const menuOpen = menuKey !== '' && dismissed !== menuKey

  const commands = useMemo(() => commandsOf(conv), [conv.info.commands, conv.caps?.items])
  const matches = useMemo(() => {
    if (slashQuery === undefined) return []
    const q = slashQuery.toLowerCase()
    return commands.filter((command) => command.name.toLowerCase().includes(q) || command.description.toLowerCase().includes(q))
  }, [commands, slashQuery])

  // 打 / 的时候才需要 Pi 给的指令清单；这时进程还没起来就先起
  const needCommands = slashQuery !== undefined && !conv.info.commands
  useEffect(() => {
    if (needCommands) ensureStarted(conv.key)
  }, [needCommands, conv.key])

  useEffect(() => {
    if (fileQuery === undefined) return setFiles([])
    let stale = false
    const timer = setTimeout(() => {
      void api.filesSearch(conv.cwd, fileQuery).then((found) => {
        if (!stale) setFiles(found)
      })
    }, 80)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [fileQuery, conv.cwd])

  useEffect(() => setSelected(0), [menuKey])

  // 菜单栏和快捷键发来的动作
  const signalCount = signal?.n
  useEffect(() => {
    if (!signal) return
    if (signal.action === 'model') setOpen('model')
    if (signal.action === 'commands') {
      setDismissed('')
      if (!conv.draft) {
        nextCursor.current = 1
        setDraft(conv.key, '/')
      }
    }
    input.current?.focus()
    // 只在收到新动作时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalCount])

  const count = slashQuery !== undefined ? matches.length : files.length

  const pickCommand = (command: Command) => {
    if (command.immediate) {
      setDraft(conv.key, '')
      void runCommand(conv.key, command.name, '')
      return
    }
    const text = `/${command.name} `
    nextCursor.current = text.length
    setDraft(conv.key, text)
    input.current?.focus()
  }

  const pickFile = (file: string) => {
    if (fileQuery === undefined) return
    const start = cursor - fileQuery.length - 1
    const inserted = `@${file} `
    nextCursor.current = start + inserted.length
    setDraft(conv.key, conv.draft.slice(0, start) + inserted + conv.draft.slice(cursor))
    input.current?.focus()
  }

  const pick = (index: number) => {
    if (slashQuery !== undefined && matches[index]) pickCommand(matches[index])
    else if (slashQuery === undefined && files[index]) pickFile(files[index])
  }

  const attach = async (list: File[]) => {
    const images = list.filter((file) => file.type.startsWith('image/'))
    if (images.length) {
      addAttachments(conv.key, await Promise.all(images.map(readImage)))
      const model = conv.info.model
      if (model?.input && !model.input.includes('image')) toast(t('当前模型不支持看图，图片可能会被忽略'), 'warning')
    }
    // 不是图片的文件：把路径写进输入框，让 Pi 自己去读
    const paths = list
      .filter((file) => !file.type.startsWith('image/'))
      .map((file) => api.pathForFile(file))
      .filter(Boolean)
    if (paths.length) {
      const text = paths.map((filePath) => `@${filePath.startsWith(`${conv.cwd}/`) ? filePath.slice(conv.cwd.length + 1) : filePath}`).join(' ')
      setDraft(conv.key, `${conv.draft}${conv.draft && !conv.draft.endsWith(' ') ? ' ' : ''}${text} `)
    }
  }

  const model = conv.info.model
  const modelLabel = model?.name ?? model?.id ?? defaults?.defaultModel ?? t('选择模型')
  const thinking = conv.info.thinkingLevel ?? defaults?.defaultThinkingLevel
  const widgets = Object.entries(conv.widgets)
  // MCP 的连接数小栏里已经有了，扩展自己报的那条不重复显示
  const statuses = Object.entries(conv.statuses)
    .filter(([key]) => key !== 'mcp')
    .map(([, text]) => text)
  const canSend = conv.draft.trim().length > 0 || conv.attachments.length > 0
  // 发过消息的对话已经绑定在它的项目上，不能再换
  const canSwitchProject = !conv.messages.length && !conv.pending.length && !conv.streaming && !conv.loading
  const access = accessOf(conv)
  const accessLabel = access === 'custom' ? t('自定义') : ACCESS_PRESETS.find((preset) => preset.id === access)?.label

  return (
    <div className="composer-wrap">
      {(open === 'skill' || open === 'mcp' || open === 'tool') && <CapPanel conv={conv} kind={open} onClose={close} />}
      {menuOpen && (
        <div className="popover suggest">
          {needCommands && <div className="menu-note">{t('正在读取技能和扩展的指令…')}</div>}
          {count === 0 && <div className="menu-empty">{slashQuery !== undefined ? t('没有匹配的指令') : t('没有找到文件')}</div>}
          {slashQuery !== undefined
            ? matches.map((command, index) => (
                <button
                  key={`${command.kind}:${command.name}`}
                  className={`suggest-item ${index === selected ? 'selected' : ''}`}
                  onMouseEnter={() => setSelected(index)}
                  // 按下时不让输入框失去焦点，不然菜单会先消失
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(index)}
                >
                  <span className="suggest-name">/{command.name}</span>
                  {command.hint && <span className="suggest-hint">{command.hint}</span>}
                  <span className="suggest-desc ellipsis">{command.description}</span>
                  <span className="suggest-kind">{KIND_LABEL[command.kind]}</span>
                </button>
              ))
            : files.map((file, index) => (
                <button
                  key={file}
                  className={`suggest-item ${index === selected ? 'selected' : ''}`}
                  onMouseEnter={() => setSelected(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(index)}
                >
                  <Icon name="file" size={13} />
                  <span className="suggest-name">{baseName(file)}</span>
                  <span className="suggest-desc ellipsis">{file}</span>
                </button>
              ))}
        </div>
      )}
      <TrustBanner cwd={conv.cwd} />
      {conv.queue.length > 0 && (
        <div className="queue">
          {conv.queue.map((text, index) => (
            <div key={index} className="queue-item ellipsis">
              {t('排队中：{text}', { text })}
            </div>
          ))}
        </div>
      )}
      {widgets.map(([key, lines]) => (
        <pre key={key} className="widget">
          {lines.join('\n')}
        </pre>
      ))}
      {/* 输入框里只留附件、模型和发送，其它功能放在下面那条小栏里 */}
      <div
        className="composer"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          void attach([...event.dataTransfer.files])
        }}
      >
        {conv.attachments.length > 0 && (
          <div className="attachments">
            {conv.attachments.map((image, index) => (
              <div key={index} className="attachment" title={image.name}>
                <img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name} />
                <button className="attachment-remove" title={t('移除')} onClick={() => removeAttachment(conv.key, index)}>
                  <Icon name="x" size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={input}
          rows={1}
          value={conv.draft}
          placeholder={conv.streaming ? t('继续补充，会在当前这一步之后送达') : t('问点什么。/ 用指令，@ 引用文件')}
          onChange={(event) => {
            setCursor(event.target.selectionStart)
            setDraft(conv.key, event.target.value)
          }}
          onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
          onPaste={(event) => {
            const pasted = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/'))
            if (!pasted.length) return
            event.preventDefault()
            void attach(pasted)
          }}
          onKeyDown={(event) => {
            // 输入法正在选字时，方向键和回车都是给输入法的
            if (event.nativeEvent.isComposing || event.keyCode === 229) return
            if (menuOpen && count > 0) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setSelected((selected + (event.key === 'ArrowDown' ? 1 : count - 1)) % count)
                return
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                pick(selected)
                return
              }
            }
            if (menuOpen && event.key === 'Escape') {
              event.preventDefault()
              setDismissed(menuKey)
              return
            }
            if (event.key === 'Escape' && conv.streaming && !open) {
              event.preventDefault()
              abort(conv.key)
              return
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              // 正在回答时：回车是插到当前这一步之后，Option+回车是等全部做完再说
              void send(conv.key, event.altKey ? 'followUp' : 'steer')
            }
          }}
        />
        <div className="composer-bar">
          <button className="icon-btn" title={t('添加图片或文件。也可以直接粘贴、拖进来')} onClick={() => picker.current?.click()}>
            <Icon name="plus" size={15} />
          </button>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              void attach([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />
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
              {t('推理 {level}', { level: thinking ? (THINKING_LABEL[thinking] ?? thinking) : t('默认') })}
              <Icon name="down" size={11} />
            </button>
            {open === 'thinking' && <ThinkingPicker conv={conv} onClose={close} />}
          </div>
          {conv.streaming && (
            <button className="round-btn stop" title={t('停止（Esc）')} onClick={() => abort(conv.key)}>
              <Icon name="stop" />
            </button>
          )}
          {(!conv.streaming || canSend) && (
            <button className="round-btn" title={t('发送')} disabled={!canSend} onClick={() => void send(conv.key)}>
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
        <div className="anchor">
          <button className={`strip-btn ${open === 'access' ? 'active' : ''}`} data-popover-trigger="composer" title={t('这次对话里 Pi 能做到哪一步')} onClick={() => toggle('access')}>
            <Icon name="shield" size={14} />
            {accessLabel ?? t('权限')}
          </button>
          {open === 'access' && <AccessMenu conv={conv} current={access} onClose={close} />}
        </div>
        {CAP_BUTTONS.map((button) => {
          const enabled = capCount(conv.caps?.items, button.kind)
          return (
            <button key={button.kind} data-popover-trigger="composer" className={`strip-btn ${open === button.kind ? 'active' : ''}`} onClick={() => toggle(button.kind)}>
              <Icon name={button.icon} size={14} />
              {button.label}
              {enabled !== undefined && <span className="strip-count">{enabled}</span>}
            </button>
          )
        })}
        <button
          className="strip-btn"
          title={t('快捷指令。也可以直接在输入框里打 /')}
          onClick={() => {
            // 输入框里已经有字时不去动它，指令只能放在开头
            if (!conv.draft.trim()) {
              setDismissed('')
              nextCursor.current = 1
              setDraft(conv.key, '/')
            } else toast(t('指令要放在消息的开头。先清空输入框，再点这里或直接打 /'), 'warning')
            input.current?.focus()
          }}
        >
          <Icon name="slash" size={14} />
          {t('指令')}
        </button>
        <span className="grow" />
        {conv.caps?.dirty ? <span className="strip-note accent">{t('改动从下一条消息起生效')}</span> : statuses.length > 0 && <span className="strip-note ellipsis">{statuses.join('　')}</span>}
      </div>
    </div>
  )
}
