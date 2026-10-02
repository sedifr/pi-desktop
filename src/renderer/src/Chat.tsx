import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ContentBlock, Msg } from '@shared/types'
import { type Conv, type ToolRun, copyText, forkFrom } from './store'
import { Icon, Markdown } from './ui'
import { t } from '@shared/i18n'

type Step = { kind: 'thinking'; text: string } | { kind: 'text'; text: string } | { kind: 'tool'; call: ContentBlock; result?: Msg }

type Block =
  | { kind: 'user'; id: string; msg: Msg }
  | { kind: 'turn'; id: string; steps: Step[]; images: GenImage[]; final?: string; error?: string; aborted?: boolean; model?: string }
  | { kind: 'note'; id: string; label: string; text: string }
  | { kind: 'shell'; id: string; msg: Msg }

/** 模型这一轮生成出来的图片 */
interface GenImage {
  src: string
  path?: string
}

/**
 * 这些工具返回的图片是模型生成的「作品」，要直接显示在回答里；read 之类读到的图片不算。
 * codemode 是 Pi 自带的出图途径；generate_image 是扩展里出图工具的惯用名字。
 */
const IMAGE_TOOLS = new Set(['generate_image', 'codemode'])

const PAGE = 30

export const ABORTED = /operation was aborted|request was aborted|aborted by (the )?user/i

function blocksOf(content: Msg['content']): ContentBlock[] {
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : []
  return content ?? []
}

function textOf(content: Msg['content']): string {
  return blocksOf(content)
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
}

/** 把一串消息整理成「用户消息 / 一轮回答 / 提示条」 */
function buildBlocks(messages: Msg[]): Block[] {
  const blocks: Block[] = []
  let turn: Extract<Block, { kind: 'turn' }> | undefined
  let lastAssistant: Msg | undefined
  let finalFrom = 0

  const closeTurn = () => {
    if (!turn) return
    // 最后一条助手消息如果没有再调工具，它的正文就是这一轮的答案
    if (lastAssistant && lastAssistant.stopReason !== 'toolUse') {
      const tail = turn.steps.slice(finalFrom)
      if (tail.length && tail.every((s) => s.kind !== 'tool')) {
        const texts = tail.filter((s) => s.kind === 'text').map((s) => s.text)
        if (texts.length) {
          turn.final = texts.join('\n\n')
          turn.steps = [...turn.steps.slice(0, finalFrom), ...tail.filter((s) => s.kind === 'thinking')]
        }
      }
    }
    turn = undefined
    lastAssistant = undefined
  }

  messages.forEach((msg, index) => {
    const id = msg.entryId ?? `live-${index}`
    if (msg.role === 'user') {
      closeTurn()
      blocks.push({ kind: 'user', id, msg })
    } else if (msg.role === 'assistant') {
      if (!turn) blocks.push((turn = { kind: 'turn', id, steps: [], images: [] }))
      lastAssistant = msg
      finalFrom = turn.steps.length
      turn.model = msg.model
      // 用户自己按了停止，有的提供商会把它报成一条「被中止」的错误，这不算出错
      const stopped = msg.stopReason === 'aborted' || (msg.stopReason === 'error' && ABORTED.test(msg.errorMessage ?? ''))
      turn.error = msg.stopReason === 'error' && !stopped ? (msg.errorMessage ?? t('请求出错')) : undefined
      turn.aborted = stopped
      for (const block of blocksOf(msg.content)) {
        if (block.type === 'thinking' && block.thinking?.trim()) turn.steps.push({ kind: 'thinking', text: block.thinking })
        else if (block.type === 'text' && block.text?.trim()) turn.steps.push({ kind: 'text', text: block.text })
        else if (block.type === 'toolCall') turn.steps.push({ kind: 'tool', call: block })
      }
    } else if (msg.role === 'toolResult') {
      const step = turn?.steps.find((s) => s.kind === 'tool' && s.call.id === msg.toolCallId)
      if (step && step.kind === 'tool') step.result = msg
      if (turn && !msg.isError && IMAGE_TOOLS.has(msg.toolName ?? '')) {
        for (const block of blocksOf(msg.content)) {
          if (block.type === 'image' && block.data) turn.images.push({ src: `data:${block.mimeType};base64,${block.data}`, path: msg.details?.path as string | undefined })
        }
      }
    } else if (msg.role === 'bashExecution') {
      closeTurn()
      blocks.push({ kind: 'shell', id, msg })
    } else if (msg.role === 'compactionSummary') {
      closeTurn()
      blocks.push({ kind: 'note', id, label: t('更早的内容已压缩成摘要'), text: msg.summary ?? '' })
    } else if (msg.role === 'branchSummary') {
      closeTurn()
      blocks.push({ kind: 'note', id, label: t('另一条分支的摘要'), text: msg.summary ?? '' })
    } else if (msg.role === 'custom' && msg.display) {
      closeTurn()
      blocks.push({ kind: 'note', id, label: msg.customType ?? t('扩展消息'), text: textOf(msg.content) })
    }
  })
  closeTurn()
  return blocks
}

function toolTitle(call: ContentBlock, cwd: string): { icon: string; label: string; detail: string } {
  const args = (call.arguments ?? {}) as Record<string, unknown>
  const rel = (p: unknown) => String(p ?? '').replace(`${cwd}/`, '')
  switch (call.name) {
    case 'bash':
      return { icon: 'terminal', label: t('运行'), detail: String(args.command ?? '').split('\n')[0] }
    case 'read':
      return { icon: 'file', label: t('读取'), detail: rel(args.path ?? args.file_path) }
    case 'edit':
      return { icon: 'edit', label: t('修改'), detail: rel(args.path ?? args.file_path) }
    case 'write':
      return { icon: 'edit', label: t('写入'), detail: rel(args.path ?? args.file_path) }
    case 'grep':
    case 'find':
    case 'ls':
      return { icon: 'search', label: call.name, detail: String(args.pattern ?? args.path ?? '') }
    default: {
      const first = Object.values(args).find((v) => typeof v === 'string') as string | undefined
      return { icon: 'tool', label: call.name ?? t('工具'), detail: first?.split('\n')[0] ?? '' }
    }
  }
}

function ToolResult({ msg }: { msg: Msg }) {
  const blocks = blocksOf(msg.content)
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  return (
    <>
      {text && <pre className={msg.isError ? 'tool-output error' : 'tool-output'}>{text.length > 20000 ? `${text.slice(0, 20000)}\n${t('…（输出太长，已截断显示）')}` : text}</pre>}
      {blocks
        .filter((b) => b.type === 'image' && b.data)
        .map((b, i) => (
          <img key={i} className="tool-image" src={`data:${b.mimeType};base64,${b.data}`} alt={t('工具返回的图片')} />
        ))}
    </>
  )
}

function ToolStep({ step, run, cwd }: { step: Extract<Step, { kind: 'tool' }>; run?: ToolRun; cwd: string }) {
  const [open, setOpen] = useState(false)
  const title = toolTitle(step.call, cwd)
  const running = !step.result && run?.running
  const result = step.result ?? run?.partial
  return (
    <div className="step">
      <div className="step-row" onClick={() => setOpen(!open)}>
        <span className={`step-icon ${step.result?.isError ? 'error' : ''}`}>
          <Icon name={title.icon} size={14} />
        </span>
        <span className="step-label">{title.label}</span>
        <span className="step-detail ellipsis">{title.detail}</span>
        {running && <span className="dot-running" />}
      </div>
      {open && (
        <div className="step-body">
          <pre className="tool-output">{JSON.stringify(step.call.arguments, null, 2)}</pre>
          {result && <ToolResult msg={result} />}
        </div>
      )}
    </div>
  )
}

function ThinkingStep({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const first = text.trim().split('\n')[0].replace(/\*\*/g, '')
  return (
    <div className="step">
      <div className="step-row" onClick={() => setOpen(!open)}>
        <span className="step-icon">
          <Icon name="brain" size={14} />
        </span>
        <span className="step-label">{t('思考')}</span>
        <span className="step-detail ellipsis">{first}</span>
      </div>
      {open && (
        <div className="step-body thinking">
          <Markdown text={text} />
        </div>
      )}
    </div>
  )
}

const Turn = memo(function Turn({ block, live, toolRuns, cwd }: { block: Extract<Block, { kind: 'turn' }>; live: boolean; toolRuns: Record<string, ToolRun>; cwd: string }) {
  const [open, setOpen] = useState<boolean | undefined>(undefined)
  const tools = block.steps.filter((s) => s.kind === 'tool').length
  // 进行中默认展开让人看到在做什么，结束后默认收起只留答案
  const expanded = open ?? live
  return (
    <div className="turn">
      {block.steps.length > 0 && (
        <div className="steps">
          <div className="steps-head" onClick={() => setOpen(!expanded)}>
            <Icon name={expanded ? 'down' : 'right'} size={12} />
            {live ? t('正在处理') : t('处理过程')}
            <span className="muted">
              {tools ? t('{steps} 步，调用工具 {tools} 次', { steps: block.steps.length, tools }) : t('{steps} 步', { steps: block.steps.length })}
            </span>
          </div>
          {expanded &&
            block.steps.map((step, index) =>
              step.kind === 'tool' ? (
                <ToolStep key={index} step={step} run={toolRuns[step.call.id ?? '']} cwd={cwd} />
              ) : step.kind === 'thinking' ? (
                <ThinkingStep key={index} text={step.text} />
              ) : (
                <div key={index} className="step-text">
                  <Markdown text={step.text} />
                </div>
              )
            )}
        </div>
      )}
      {block.images.length > 0 && (
        <div className="gen-images">
          {block.images.map((image, index) => (
            <figure key={index}>
              <img src={image.src} alt={t('生成的图片')} />
              {image.path && <figcaption title={image.path}>{t('已保存到 {path}', { path: image.path.replace(`${cwd}/`, '') })}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      {block.final && <Markdown text={block.final} />}
      {block.final && !live && (
        <div className="msg-actions under">
          <button className="icon-btn" title={t('复制这条回答')} onClick={() => void copyText(block.final!)}>
            <Icon name="copy" size={14} />
          </button>
        </div>
      )}
      {block.error && <div className="banner error">{block.error}</div>}
      {block.aborted && <div className="muted small">{t('已停止')}</div>}
    </div>
  )
})

function UserMessage({ msg, onFork }: { msg: Msg; onFork?: () => void }) {
  const blocks = blocksOf(msg.content)
  const text = textOf(msg.content)
  return (
    <div className="user-row">
      <div className="msg-actions">
        {onFork && (
          <button className="icon-btn" title={t('从这里另开一个对话：保留这条之前的内容，这条消息可以改了再发')} onClick={onFork}>
            <Icon name="branch" size={14} />
          </button>
        )}
        <button className="icon-btn" title={t('复制')} onClick={() => void copyText(text)}>
          <Icon name="copy" size={14} />
        </button>
      </div>
      <div className="user-bubble">
        {blocks
          .filter((b) => b.type === 'image' && b.data)
          .map((b, i) => (
            <img key={i} className="user-image" src={`data:${b.mimeType};base64,${b.data}`} alt={t('附带的图片')} />
          ))}
        {textOf(msg.content)}
      </div>
    </div>
  )
}

/** 用户用 ! 直接运行的命令和它的输出 */
function ShellBlock({ msg }: { msg: Msg }) {
  const output = msg.output ?? ''
  const failed = msg.isError || (msg.exitCode != null && msg.exitCode !== 0)
  return (
    <div className="shell-block">
      <div className="shell-head">
        <Icon name="terminal" size={14} />
        <span className="shell-cmd grow">{msg.command}</span>
        {msg.running && <span className="dot-running" />}
        {msg.cancelled && <span className="muted small">{t('已停止')}</span>}
        {!msg.running && !msg.cancelled && failed && msg.exitCode != null && <span className="shell-exit">{t('退出码 {code}', { code: msg.exitCode })}</span>}
        {msg.excludeFromContext && (
          <span className="muted small" title={t('这条命令的输出只给你自己看，不会带给 Pi')}>
            {t('不带给 Pi')}
          </span>
        )}
      </div>
      {output && <pre className={msg.isError ? 'tool-output error' : 'tool-output'}>{output.length > 20000 ? `${t('（输出太长，只显示结尾）…')}\n${output.slice(-20000)}` : output}</pre>}
      {msg.truncated && msg.fullOutputPath && <div className="muted small">{t('完整输出在 {path}', { path: msg.fullOutputPath })}</div>}
    </div>
  )
}

function Note({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="note">
      <div className="note-head" onClick={() => setOpen(!open)}>
        <span className="note-line" />
        {label}
        <span className="note-line" />
      </div>
      {open && text && (
        <div className="note-body">
          <Markdown text={text} />
        </div>
      )}
    </div>
  )
}

export function Chat({ conv }: { conv: Conv }) {
  const blocks = useMemo(() => buildBlocks(conv.messages), [conv.messages])
  const [shown, setShown] = useState(PAGE)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    setShown(PAGE)
    stick.current = true
  }, [conv.key])

  // 只有本来就停在底部时才跟着新内容往下滚，用户往上翻看时不打扰
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  })

  const visible = blocks.slice(Math.max(0, blocks.length - shown))
  // 这是第几条用户消息（从 0 数），另开对话时要告诉 Pi
  const userIndexOf = (target: Block) => blocks.filter((block) => block.kind === 'user').indexOf(target as Extract<Block, { kind: 'user' }>)
  const lastTurn = [...blocks].reverse().find((b) => b.kind === 'turn')

  return (
    <div
      className="chat-scroll"
      ref={scroller}
      onScroll={(event) => {
        const el = event.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
    >
      <div className="chat-column">
        {blocks.length > shown && (
          <button className="load-more" onClick={() => setShown(shown + PAGE)}>
            {t('显示更早的消息（还有 {n} 条）', { n: blocks.length - shown })}
          </button>
        )}
        {visible.map((block) =>
          block.kind === 'user' ? (
            <UserMessage key={block.id} msg={block.msg} onFork={conv.streaming ? undefined : () => void forkFrom(conv.key, userIndexOf(block), textOf(block.msg.content))} />
          ) : block.kind === 'turn' ? (
            <Turn key={block.id} block={block} live={conv.streaming && block === lastTurn} toolRuns={conv.toolRuns} cwd={conv.cwd} />
          ) : block.kind === 'shell' ? (
            <ShellBlock key={block.id} msg={block.msg} />
          ) : (
            <Note key={block.id} label={block.label} text={block.text} />
          )
        )}
        {conv.pending.map((item, index) => (
          <UserMessage
            key={`pending-${index}`}
            msg={{ role: 'user', content: [...item.images.map((image) => ({ type: 'image', data: image.data, mimeType: image.mimeType })), { type: 'text', text: item.text }] }}
          />
        ))}
        {(conv.pending.length > 0 || (conv.streaming && blocks[blocks.length - 1]?.kind === 'user')) && (
          <div className="working">
            <span className="dot-running" />
            {conv.status === 'starting' ? t('正在启动 Pi…') : t('正在思考…')}
          </div>
        )}
        {conv.notice && <div className="banner">{conv.notice}</div>}
        {conv.error && <div className="banner error">{conv.error}</div>}
      </div>
    </div>
  )
}
