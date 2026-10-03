import { useCallback, useEffect, useState } from 'react'
import { t } from '@shared/i18n'
import type { TemplateInfo } from '@shared/types'
import { api, commandsChanged, errorText, loadTrust, toast, useApp } from './store'
import { TrustBanner } from './Trust'
import { Icon, baseName } from './ui'

interface Draft {
  name: string
  scope: 'global' | 'project'
  description: string
  argumentHint: string
  body: string
  originalFile?: string
}

const BLANK: Draft = { name: '', scope: 'global', description: '', argumentHint: '', body: '' }

function Editor({ draft, cwd, onDone, onCancel }: { draft: Draft; cwd?: string; onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState(draft)
  const [error, setError] = useState<string>()
  const set = (patch: Partial<Draft>) => setForm({ ...form, ...patch })
  const save = async () => {
    try {
      await api.templateSave({ ...form, cwd })
      onDone()
    } catch (e) {
      setError(errorText(e))
    }
  }
  return (
    <div className="custom-form">
      <div className="pop-title">{form.originalFile ? t('修改指令') : t('新建指令')}</div>
      <label>
        {t('名称')}
        <div className="prefixed">
          <span>/</span>
          <input className="field" autoFocus={!form.originalFile} value={form.name} placeholder={t('review（输入框里打 / 加这个名字来用）')} onChange={(event) => set({ name: event.target.value })} />
        </div>
      </label>
      <label>
        {t('一句话说明')}
        <input className="field" value={form.description} placeholder={t('显示在指令列表里，帮你记住它是干什么的')} onChange={(event) => set({ description: event.target.value })} />
      </label>
      <label>
        {t('内容')}
        <textarea className="field" rows={8} value={form.body} placeholder={t('要发给 Pi 的话。比如：检查暂存区的改动，重点看 $1。')} onChange={(event) => set({ body: event.target.value })} />
        <span className="muted small">{t('可以带参数：$1、$2 是第几个参数，$@ 是全部参数，${1:-默认值} 是没填时用默认值。')}</span>
      </label>
      <label>
        {t('参数提示（可选）')}
        <input className="field" value={form.argumentHint} placeholder={t('[重点]　方括号表示可填可不填，尖括号表示必填')} onChange={(event) => set({ argumentHint: event.target.value })} />
      </label>
      <label>
        {t('在哪里能用')}
        <div className="segmented">
          <button className={form.scope === 'global' ? 'on' : ''} onClick={() => set({ scope: 'global' })}>
            {t('所有项目')}
          </button>
          <button className={form.scope === 'project' ? 'on' : ''} disabled={!cwd} title={cwd ?? t('先打开一个对话，才知道是哪个项目')} onClick={() => set({ scope: 'project' })}>
            {cwd ? t('只在「{project}」', { project: baseName(cwd) }) : t('只在当前项目')}
          </button>
        </div>
      </label>
      {error && <div className="banner error">{error}</div>}
      <div className="dialog-actions">
        <button className="btn" onClick={onCancel}>
          {t('取消')}
        </button>
        <button className="btn primary" onClick={() => void save()}>
          {t('保存')}
        </button>
      </div>
    </div>
  )
}

/** 设置里的「快捷指令」页：管理 Pi 的提示词模板 */
export function Commands() {
  const cwd = useApp((s) => (s.activeKey ? s.convs[s.activeKey]?.cwd : undefined))
  const [list, setList] = useState<TemplateInfo[]>()
  const [editing, setEditing] = useState<Draft>()

  const reload = useCallback(() => {
    api.templatesList(cwd).then(setList, (error) => toast(errorText(error), 'error'))
  }, [cwd])
  useEffect(reload, [reload])

  const changed = () => {
    setEditing(undefined)
    commandsChanged()
    reload()
    // 第一次存项目指令会让这个项目变成「要信任才加载」
    if (cwd) loadTrust(cwd)
  }

  const remove = async (template: TemplateInfo) => {
    if (!window.confirm(t('把指令 /{name} 移到废纸篓？', { name: template.name }))) return
    try {
      await api.templateTrash(template.file, cwd)
      changed()
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  return (
    <>
      <div className="set-note">
        {t('快捷指令是一段存好的话。在输入框里打 / 加上它的名字，就等于把这段话发给 Pi。适合反复要说的要求。')}
        <br />
        {t('它们存成 Pi 的提示词模板，命令行里也能用。')}
      </div>
      {cwd && <TrustBanner cwd={cwd} always />}
      <div className="cap-section">
        {t('我的指令')}
        <span className="grow" />
        <button className="btn" onClick={() => setEditing({ ...BLANK })}>
          <Icon name="plus" size={13} /> {t('新建指令')}
        </button>
      </div>
      {editing && <Editor key={editing.originalFile ?? 'new'} draft={editing} cwd={cwd} onCancel={() => setEditing(undefined)} onDone={changed} />}
      {!list && <div className="cap-empty">{t('正在读取…')}</div>}
      {list && !list.length && !editing && <div className="cap-empty">{t('还没有指令。点「新建指令」写第一条。')}</div>}
      {list?.map((template) => (
        <div key={template.file} className="set-row">
          <div className="set-label grow">
            <span className="mono">/{template.name}</span>
            {template.argumentHint && <span className="muted">　{template.argumentHint}</span>}
            <div className="muted small">
              {template.scope === 'project' ? t('只在「{project}」', { project: baseName(cwd ?? '') }) : t('所有项目')}
              {template.description && ` · ${template.description}`}
            </div>
          </div>
          <div className="set-control">
            <button
              className="btn"
              onClick={() => setEditing({ name: template.name, scope: template.scope, description: template.description, argumentHint: template.argumentHint, body: template.body, originalFile: template.file })}
            >
              {t('修改')}
            </button>
            <button className="btn" onClick={() => void remove(template)}>
              {t('删除')}
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: '⌘N', label: t('新对话') },
  { keys: '⌘O', label: t('添加项目文件夹') },
  { keys: '⌘K', label: t('搜索对话') },
  { keys: '⌘,', label: t('打开设置') },
  { keys: '⌘B', label: t('显示或隐藏侧栏') },
  { keys: '⌥⌘B', label: t('显示或隐藏右侧面板') },
  { keys: '⌘/', label: t('打开快捷指令') },
  { keys: '⌘⇧M', label: t('切换模型') },
  { keys: '⌘⇧C', label: t('复制上一条回答') },
  { keys: '⌘.', label: t('停止正在进行的回答') },
  { keys: 'Esc', label: t('停止正在进行的回答（光标在输入框里时）；关掉菜单或设置') },
  { keys: 'Enter', label: t('发送。正在回答时是插到当前这一步之后') },
  { keys: '⌥Enter', label: t('正在回答时：等全部做完再处理这条') },
  { keys: '⇧Enter', label: t('换行') },
  { keys: '/', label: t('在输入框开头打，选快捷指令') },
  { keys: '@', label: t('在输入框里打，引用项目里的文件') },
  { keys: '!', label: t('在输入框开头打，直接运行一条命令，结果会带给 Pi') },
  { keys: '!!', label: t('在输入框开头打，运行命令但结果不带给 Pi') }
]

export function Shortcuts() {
  return (
    <>
      {SHORTCUTS.map((shortcut) => (
        <div key={shortcut.keys + shortcut.label} className="set-row">
          <div className="set-label">{shortcut.label}</div>
          <kbd>{shortcut.keys}</kbd>
        </div>
      ))}
    </>
  )
}
