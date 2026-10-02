import { useCallback, useEffect, useMemo, useState } from 'react'
import { t } from '@shared/i18n'
import type { ChangedFile, ChangesInfo } from '@shared/types'
import { type Conv, api, errorText } from './store'
import { Icon, baseName } from './ui'

const STATUS_LABEL: Record<ChangedFile['status'], string> = { modified: 'M', added: 'A', deleted: 'D', renamed: 'R', untracked: 'N' }
const STATUS_TITLE: Record<ChangedFile['status'], string> = {
  modified: t('改过'),
  added: t('新增'),
  deleted: t('删除'),
  renamed: t('改名'),
  untracked: t('新文件，还没被 git 记录')
}

/** 这次对话里 Pi 用改文件、写文件工具动过哪些文件，以及改文件工具留下的差异 */
function touchedBy(conv: Conv): Map<string, string[]> {
  const calls = new Map<string, string>()
  const touched = new Map<string, string[]>()
  for (const message of conv.messages) {
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type !== 'toolCall' || (block.name !== 'edit' && block.name !== 'write')) continue
        const args = (block.arguments ?? {}) as Record<string, unknown>
        const file = String(args.path ?? args.file_path ?? '')
        if (!file || !block.id) continue
        const relative = file.startsWith(`${conv.cwd}/`) ? file.slice(conv.cwd.length + 1) : file
        calls.set(block.id, relative)
        if (!touched.has(relative)) touched.set(relative, [])
      }
    } else if (message.role === 'toolResult' && message.toolCallId && !message.isError) {
      const file = calls.get(message.toolCallId)
      const patch = message.details?.patch
      if (file && typeof patch === 'string') touched.get(file)?.push(patch)
    }
  }
  return touched
}

/** 把统一差异格式的文字画出来：加的一行绿、删的一行红，文件头那几行不显示 */
export function DiffView({ text }: { text: string }) {
  const lines = useMemo(() => text.replace(/\n+$/, '').split('\n').filter((line) => !/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode|similarity index|rename (from|to)|\\ No newline)/.test(line)), [text])
  if (!text.trim()) return <div className="diff-empty">{t('没有可以显示的改动')}</div>
  return (
    <pre className="diff">
      {lines.map((line, index) => {
        const kind = line.startsWith('@@') ? 'hunk' : line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : ''
        return (
          <div key={index} className={`diff-line ${kind}`}>
            {kind === 'hunk' ? line.replace(/^@@ (.*?) @@/, '⋯ $1 ') : line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

function FileRow({ conv, file, mine, patches, git }: { conv: Conv; file: ChangedFile; mine: boolean; patches?: string[]; git: boolean }) {
  const [open, setOpen] = useState(false)
  const [diff, setDiff] = useState<string>()
  const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/') + 1) : ''

  // 展开时才去取改动。是 git 仓库就问 git（看得到全部没提交的改动），不是就用改文件工具当时留下的那几段
  useEffect(() => {
    if (!open) return
    if (!git) return setDiff((patches ?? []).join('\n'))
    let stale = false
    api.changesDiff(conv.cwd, file.path).then(
      (text) => !stale && setDiff(text),
      (error) => !stale && setDiff(errorText(error))
    )
    return () => {
      stale = true
    }
  }, [open, git, conv.cwd, file.path, file.added, file.removed, patches])

  return (
    <div className={`change ${open ? 'open' : ''}`}>
      <div className="change-row" onClick={() => setOpen(!open)}>
        <Icon name={open ? 'down' : 'right'} size={11} />
        <span className={`change-status ${file.status}`} title={STATUS_TITLE[file.status]}>
          {STATUS_LABEL[file.status]}
        </span>
        <span className="change-name ellipsis" title={file.path}>
          {baseName(file.path)}
          {dir && <span className="muted">　{dir}</span>}
        </span>
        {mine && <span className="dot-mine" title={t('这次对话里 Pi 改过')} />}
        {file.added != null && (
          <span className="change-stat">
            <span className="plus">+{file.added}</span> <span className="minus">−{file.removed}</span>
          </span>
        )}
        <button
          className="icon-btn hover-only"
          title={t('用默认的应用打开')}
          onClick={(event) => {
            event.stopPropagation()
            api.fileOpen(conv.cwd, file.path)
          }}
        >
          <Icon name="edit" size={13} />
        </button>
        <button
          className="icon-btn hover-only"
          title={t('在访达中显示')}
          onClick={(event) => {
            event.stopPropagation()
            api.fileReveal(conv.cwd, file.path)
          }}
        >
          <Icon name="folder" size={13} />
        </button>
      </div>
      {open && (diff === undefined ? <div className="diff-empty">{t('正在读取…')}</div> : <DiffView text={diff} />)}
    </div>
  )
}

/** 右侧面板的「改动」页：项目里没提交的改动，点开一个文件看它改了什么 */
export function Changes({ conv }: { conv: Conv }) {
  const [info, setInfo] = useState<ChangesInfo>()
  const touched = useMemo(() => touchedBy(conv), [conv.messages, conv.cwd])

  const reload = useCallback(() => {
    api.changesList(conv.cwd).then(setInfo, () => setInfo({ git: false, files: [] }))
  }, [conv.cwd])
  // 换了项目、Pi 又动了文件、一轮回答结束时都重新读一遍；窗口回到前台时也读（可能在别处改了文件）
  useEffect(reload, [reload, touched.size, conv.streaming, conv.shellRunning])
  useEffect(() => {
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [reload])

  const files: ChangedFile[] = useMemo(() => {
    if (!info) return []
    if (info.git) return info.files
    return [...touched.keys()].map((file) => ({ path: file, status: 'modified' as const }))
  }, [info, touched])
  const added = files.reduce((sum, file) => sum + (file.added ?? 0), 0)
  const removed = files.reduce((sum, file) => sum + (file.removed ?? 0), 0)

  return (
    <div className="pane-scroll">
      <div className="pane-bar">
        <span className="grow ellipsis">
          {!info
            ? t('正在读取…')
            : info.git
              ? t('{n} 个文件有没提交的改动', { n: files.length })
              : t('这次对话改过 {n} 个文件', { n: files.length })}
          {info?.branch && <span className="muted">　{info.branch}</span>}
        </span>
        {info?.git && files.length > 0 && (
          <span className="change-stat">
            <span className="plus">+{added}</span> <span className="minus">−{removed}</span>
          </span>
        )}
        <button className="icon-btn" title={t('重新读取')} onClick={reload}>
          <Icon name="refresh" size={13} />
        </button>
      </div>
      {info && !files.length && (
        <div className="pane-empty">
          {info.git ? t('没有没提交的改动。Pi 改了文件之后会出现在这里。') : t('这个项目不是 git 仓库，所以这里只列出这次对话里 Pi 改过的文件。目前还没有。')}
        </div>
      )}
      {files.map((file) => (
        <FileRow key={file.path} conv={conv} file={file} mine={touched.has(file.path)} patches={touched.get(file.path)} git={Boolean(info?.git)} />
      ))}
    </div>
  )
}
