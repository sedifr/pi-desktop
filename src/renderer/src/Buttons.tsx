import { useState } from 'react'
import { ACCESS_LEVELS, APP_ACTIONS, type AccessLevel, type AppAction, BUTTON_SLOTS, type ButtonAction, type ButtonSlot, type UserButton } from '@shared/buttons'
import { t } from '@shared/i18n'
import { addButton, api, askPiToCustomize, editButton, moveButton, removeButton, runButton, saveButtons, useApp } from './store'
import { ICON_CHOICES, Icon, hasIcon } from './ui'

/** 每个位置在界面上叫什么。icons 表示那里只显示图标，名字放在提示里 */
const SLOTS: Record<ButtonSlot, { label: string; icons?: boolean }> = {
  'composer.above': { label: t('输入框上方') },
  'composer.bar': { label: t('输入框里（加号旁边）') },
  rail: { label: t('聊天区旁边那列图标'), icons: true },
  header: { label: t('标题栏'), icons: true },
  sidebar: { label: t('侧栏') },
  welcome: { label: t('新对话的空白页') }
}

/** 界面上现成的功能：叫什么，搬成按钮时默认配哪个图标 */
const APP: Record<AppAction, { label: string; icon: string }> = {
  new: { label: t('新对话'), icon: 'edit' },
  newWindow: { label: t('新开一个窗口'), icon: 'panel' },
  addProject: { label: t('添加项目文件夹'), icon: 'folder' },
  search: { label: t('搜索对话'), icon: 'search' },
  find: { label: t('在当前对话里查找'), icon: 'search' },
  commands: { label: t('打开快捷指令'), icon: 'slash' },
  model: { label: t('切换模型'), icon: 'brain' },
  compact: { label: t('压缩上下文'), icon: 'chart' },
  copyLast: { label: t('复制上一条回答'), icon: 'copy' },
  export: { label: t('把这个对话导出成网页'), icon: 'external' },
  rename: { label: t('给这个对话改名'), icon: 'edit' },
  stop: { label: t('停止正在进行的回答'), icon: 'stop' },
  minimal: { label: t('最精简'), icon: 'bolt' },
  'pane:files': { label: t('文件'), icon: 'folder' },
  'pane:changes': { label: t('改动'), icon: 'diff' },
  'pane:browser': { label: t('浏览器'), icon: 'globe' },
  'pane:terminal': { label: t('终端'), icon: 'terminal' },
  togglePane: { label: t('显示或隐藏右侧面板'), icon: 'panel' },
  toggleSidebar: { label: t('显示或隐藏侧栏'), icon: 'sidebar' },
  images: { label: t('图片'), icon: 'image' },
  market: { label: t('插件市场'), icon: 'store' },
  settings: { label: t('打开设置'), icon: 'gear' }
}

const ACCESS_LABEL: Record<AccessLevel, string> = { read: t('只读'), edit: t('可改文件'), full: t('完全访问') }
const THINKING: Record<string, string> = { off: t('关'), minimal: t('最低'), low: t('低'), medium: t('中'), high: t('高'), xhigh: t('很高'), max: t('最高') }

/** 一个界面功能的全名。右侧面板的四页单看名字（「文件」「终端」）不知道指什么，前面带上面板 */
const appName = (action: AppAction): string => (action.startsWith('pane:') ? t('右侧面板：{tab}', { tab: APP[action].label }) : APP[action].label)

const oneLine = (text: string, max = 70): string => {
  const line = text.trim().split('\n')[0]
  return line.length > max ? `${line.slice(0, max)}…` : line
}

/** 用一句话说出这个按钮按下去会做什么 */
function describe(action: ButtonAction): string {
  switch (action.type) {
    case 'prompt':
      return action.send ? t('发送：{text}', { text: oneLine(action.text) }) : t('放进输入框：{text}', { text: oneLine(action.text) })
    case 'shell':
      return t('运行命令：{command}', { command: oneLine(action.command) })
    case 'open':
      return t('打开：{target}', { target: oneLine(action.target) })
    case 'app':
      return t('界面功能：{name}', { name: appName(action.do) })
    case 'set':
      return t('切到 {what}', { what: [action.model, action.thinking && t('推理 {level}', { level: THINKING[action.thinking] ?? action.thinking }), action.access && ACCESS_LABEL[action.access]].filter(Boolean).join('、') })
  }
}

/** 按钮上的图标：自带图标的名字画成图标，别的（一两个字、一个表情）原样显示 */
function Glyph({ button, size, always }: { button: Pick<UserButton, 'icon' | 'label'>; size: number; always?: boolean }) {
  if (hasIcon(button.icon)) return <Icon name={button.icon ?? ''} size={size} />
  // 只显示图标的位置上没配图标：拿名字的第一个字顶上
  const glyph = button.icon || (always ? (Array.from(button.label)[0] ?? '') : '')
  return glyph ? <span className="ubtn-glyph">{glyph}</span> : null
}

/**
 * 一个挂载位：把用户放在这里的按钮画出来。没有按钮就什么都不占。
 * 点一下执行；右键修改。按下时不抢输入框的光标，写到一半的话不会被打断。
 */
export function Slot({ name }: { name: ButtonSlot }) {
  const buttons = useApp((s) => s.buttons)
  const mine = buttons.filter((button) => button.slot === name)
  if (!mine.length) return null
  const icons = SLOTS[name].icons
  const base = name === 'rail' ? 'rail-btn' : name === 'header' ? 'icon-btn no-drag' : name === 'sidebar' ? 'nav-item' : 'ubtn'
  return (
    <div className={`slot slot-${name.replace('.', '-')}`} data-slot={name}>
      {mine.map((button) => (
        <button
          key={button.id}
          className={base}
          data-button={button.id}
          title={`${icons ? `${button.label || describe(button.action)}\n` : ''}${describe(button.action)}\n${t('右键修改')}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void runButton(button)}
          onContextMenu={(event) => {
            event.preventDefault()
            editButton(button)
          }}
        >
          <Glyph button={button} size={name === 'rail' ? 16 : name === 'header' ? 15 : name === 'sidebar' ? 16 : 13} always={icons} />
          {!icons && button.label && <span className="ellipsis">{button.label}</span>}
        </button>
      ))}
      {name === 'rail' && <span className="rail-sep" />}
    </div>
  )
}

type ActionType = ButtonAction['type']
const TYPES: { id: ActionType; label: string; hint: string }[] = [
  { id: 'prompt', label: t('说一段话'), hint: t('一句常说的话，或者一条快捷指令、一个技能') },
  { id: 'shell', label: t('运行命令'), hint: t('直接在项目文件夹里运行一条命令，输出显示在对话里') },
  { id: 'open', label: t('打开'), hint: t('一个网址、文件或文件夹') },
  { id: 'app', label: t('界面功能'), hint: t('把界面上现成的一个功能搬到顺手的地方') },
  { id: 'set', label: t('切换档位'), hint: t('一下切到某个模型、推理档位或权限档位') }
]

interface Form {
  label: string
  icon: string
  slot: ButtonSlot
  type: ActionType
  text: string
  send: boolean
  command: string
  quiet: boolean
  target: string
  app: AppAction
  model: string
  thinking: string
  access: AccessLevel | ''
}

function formOf(button: UserButton): Form {
  const a = button.action
  return {
    label: button.label,
    icon: button.icon ?? '',
    slot: button.slot,
    type: a.type,
    text: a.type === 'prompt' ? a.text : '',
    send: a.type === 'prompt' ? a.send === true : true,
    command: a.type === 'shell' ? a.command : '',
    quiet: a.type === 'shell' ? a.quiet === true : false,
    target: a.type === 'open' ? a.target : '',
    app: a.type === 'app' ? a.do : 'new',
    model: a.type === 'set' ? (a.model ?? '') : '',
    thinking: a.type === 'set' ? (a.thinking ?? '') : '',
    access: a.type === 'set' ? (a.access ?? '') : ''
  }
}

/** 从表单拼出动作。缺了必填的东西就返回一句说明 */
function actionOf(form: Form): ButtonAction | string {
  switch (form.type) {
    case 'prompt':
      return form.text.trim() ? { type: 'prompt', text: form.text, send: form.send } : t('还没写要说的话')
    case 'shell':
      return form.command.trim() ? { type: 'shell', command: form.command, quiet: form.quiet } : t('还没写要运行的命令')
    case 'open': {
      const target = form.target.trim()
      if (!target) return t('还没写要打开什么')
      return /^(https?:\/\/|\/|~\/)/i.test(target) || target === '~' ? { type: 'open', target } : t('要写完整的路径（以 / 或 ~/ 开头），或者一个 http 开头的网址')
    }
    case 'app':
      return { type: 'app', do: form.app }
    case 'set':
      return form.model || form.thinking || form.access
        ? { type: 'set', ...(form.model ? { model: form.model.trim() } : {}), ...(form.thinking ? { thinking: form.thinking } : {}), ...(form.access ? { access: form.access } : {}) }
        : t('模型、推理、权限至少选一样')
  }
}

function Editor({ original, isNew }: { original: UserButton; isNew: boolean }) {
  const buttons = useApp((s) => s.buttons)
  const conv = useApp((s) => (s.activeKey ? s.convs[s.activeKey] : undefined))
  const [form, setForm] = useState(() => formOf(original))
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<Form>) => {
    setError(undefined)
    setForm((current) => ({ ...current, ...patch }))
  }
  const close = () => editButton()
  const models = conv?.info.models ?? []
  const commands = conv?.info.commands ?? []
  const iconsOnly = SLOTS[form.slot].icons

  const save = async () => {
    const action = actionOf(form)
    if (typeof action === 'string') return setError(action)
    const label = form.label.trim()
    const icon = form.icon.trim()
    if (!label && !icon) return setError(t('给按钮起个名字，或者挑一个图标'))
    const button: UserButton = { id: original.id, label, ...(icon ? { icon } : {}), slot: form.slot, action }
    setSaving(true)
    const ok = await saveButtons(isNew ? [...buttons, button] : buttons.map((item) => (item.id === original.id ? button : item)))
    setSaving(false)
    if (ok) close()
  }

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div
        className="dialog button-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') close()
        }}
      >
        <div className="dialog-title">{isNew ? t('新按钮') : t('修改按钮')}</div>

        <div className="button-preview">
          <span className="muted small">{t('样子')}</span>
          <span className={iconsOnly ? 'rail-btn' : 'ubtn'}>
            <Glyph button={{ icon: form.icon.trim(), label: form.label.trim() || t('按钮') }} size={iconsOnly ? 16 : 13} always={iconsOnly} />
            {!iconsOnly && <span className="ellipsis">{form.label.trim() || t('按钮')}</span>}
          </span>
        </div>

        <label>
          {t('名字')}
          <input className="field" autoFocus={isNew} value={form.label} maxLength={40} placeholder={iconsOnly ? t('这个位置只显示图标，名字在鼠标停上去时出现') : t('显示在按钮上的字')} onChange={(event) => set({ label: event.target.value })} />
        </label>

        <div className="form-block">
          {t('图标')}
          <div className="icon-grid">
            <button className={`icon-choice ${form.icon ? '' : 'on'}`} title={t('不要图标')} onClick={() => set({ icon: '' })}>
              <Icon name="x" size={12} />
            </button>
            {ICON_CHOICES.map((name) => (
              <button key={name} className={`icon-choice ${form.icon === name ? 'on' : ''}`} title={name} onClick={() => set({ icon: name })}>
                <Icon name={name} size={15} />
              </button>
            ))}
            <input
              className="field icon-text"
              value={hasIcon(form.icon) ? '' : form.icon}
              maxLength={4}
              placeholder={t('或者写一个字、一个表情')}
              onChange={(event) => set({ icon: event.target.value })}
            />
          </div>
        </div>

        <label>
          {t('放在哪')}
          <select className="field" value={form.slot} onChange={(event) => set({ slot: event.target.value as ButtonSlot })}>
            {BUTTON_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {SLOTS[slot].label}
              </option>
            ))}
          </select>
        </label>

        <div className="form-block">
          {t('按下去做什么')}
          <div className="segmented wrap">
            {TYPES.map((type) => (
              <button key={type.id} className={form.type === type.id ? 'on' : ''} title={type.hint} onClick={() => set({ type: type.id })}>
                {type.label}
              </button>
            ))}
          </div>
          <span className="muted small">{TYPES.find((type) => type.id === form.type)?.hint}</span>
        </div>

        {form.type === 'prompt' && (
          <>
            <textarea className="field" rows={4} value={form.text} placeholder={t('要对 Pi 说的话。用指令或技能的话，开头写 /名字')} onChange={(event) => set({ text: event.target.value })} />
            {commands.length > 0 && (
              <select className="field" value="" onChange={(event) => event.target.value && set({ text: `/${event.target.value} ${form.text.replace(/^\/\S+\s*/, '')}`.trimEnd() + ' ' })}>
                <option value="">{t('从快捷指令和技能里选一个…')}</option>
                {commands.map((command) => (
                  <option key={command.name} value={command.name}>
                    /{command.name}
                  </option>
                ))}
              </select>
            )}
            <div className="segmented">
              <button className={form.send ? 'on' : ''} onClick={() => set({ send: true })}>
                {t('点了直接发出去')}
              </button>
              <button className={form.send ? '' : 'on'} onClick={() => set({ send: false })}>
                {t('先放进输入框')}
              </button>
            </div>
            <span className="muted small">{form.send ? t('输入框里已经写了字的话，会接在这段话后面一起发出去') : t('放进输入框，等你补完再发。适合每次都要补几个字的话')}</span>
          </>
        )}
        {form.type === 'shell' && (
          <>
            <input className="field mono" value={form.command} placeholder="git status --short" onChange={(event) => set({ command: event.target.value })} />
            <div className="segmented">
              <button className={form.quiet ? '' : 'on'} onClick={() => set({ quiet: false })}>
                {t('结果带给 Pi')}
              </button>
              <button className={form.quiet ? 'on' : ''} onClick={() => set({ quiet: true })}>
                {t('只给自己看')}
              </button>
            </div>
          </>
        )}
        {form.type === 'open' && (
          <>
            <input className="field" value={form.target} placeholder={t('https://… 或 ~/Documents/笔记.md')} onChange={(event) => set({ target: event.target.value })} />
            <span className="muted small">{t('网址在右侧面板的浏览器里打开；文件和文件夹用它默认的应用打开')}</span>
          </>
        )}
        {form.type === 'app' && (
          <select
            className="field"
            value={form.app}
            onChange={(event) => {
              const next = event.target.value as AppAction
              // 名字和图标还没自己定过的话，跟着选的功能走
              const auto = (value: string, from: string) => !value || value === from
              set({ app: next, ...(auto(form.label, APP[form.app].label) ? { label: APP[next].label } : {}), ...(auto(form.icon, APP[form.app].icon) ? { icon: APP[next].icon } : {}) })
            }}
          >
            {APP_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {appName(action)}
              </option>
            ))}
          </select>
        )}
        {form.type === 'set' && (
          <>
            <label>
              {t('模型')}
              {models.length > 0 ? (
                <select className="field" value={form.model} onChange={(event) => set({ model: event.target.value })}>
                  <option value="">{t('不换')}</option>
                  {form.model && !models.some((model) => `${model.provider}/${model.id}` === form.model) && <option value={form.model}>{form.model}</option>}
                  {models.map((model) => (
                    <option key={`${model.provider}/${model.id}`} value={`${model.provider}/${model.id}`}>
                      {model.provider}/{model.id}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="field" value={form.model} placeholder={t('提供商/模型，留空就是不换')} onChange={(event) => set({ model: event.target.value })} />
              )}
            </label>
            <label>
              {t('推理')}
              <select className="field" value={form.thinking} onChange={(event) => set({ thinking: event.target.value })}>
                <option value="">{t('不换')}</option>
                {Object.entries(THINKING).map(([level, label]) => (
                  <option key={level} value={level}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('权限')}
              <select className="field" value={form.access} onChange={(event) => set({ access: event.target.value as AccessLevel | '' })}>
                <option value="">{t('不换')}</option>
                {ACCESS_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {ACCESS_LABEL[level]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {error && <div className="banner error">{error}</div>}
        <div className="dialog-actions">
          {!isNew && (
            <button
              className="btn danger"
              onClick={() => {
                removeButton(original.id)
                close()
              }}
            >
              {t('删除')}
            </button>
          )}
          <span className="grow" />
          <button className="btn" onClick={close}>
            {t('取消')}
          </button>
          <button className="btn primary" disabled={saving} onClick={() => void save()}>
            {t('保存')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 按钮的编辑框。从哪里都能打开（右键按钮、设置页、加号菜单），所以挂在最外层 */
export function ButtonEditor() {
  const edit = useApp((s) => s.buttonEdit)
  return edit ? <Editor key={edit.button.id} original={edit.button} isNew={edit.isNew} /> : null
}

/** 设置里「个性化」页的按钮那一段：列出来、加、改、挪、删，或者交给 Pi 去改 */
export function ButtonsSettings() {
  const buttons = useApp((s) => s.buttons)
  const problem = useApp((s) => s.buttonsProblem)
  return (
    <>
      <div className="cap-section">
        {t('自己的按钮')}
        <span className="grow" />
        <button className="btn" onClick={() => addButton()}>
          <Icon name="plus" size={13} /> {t('添加按钮')}
        </button>
      </div>
      <div className="muted small set-hint">{t('把常说的话、常用的指令和技能、常跑的命令、界面上现成的功能做成按钮，放到你顺手的位置。放哪、叫什么、做什么都由你定；在界面上右键一个按钮就能改它。')}</div>
      {problem && <div className="banner error">{problem}</div>}
      {!buttons.length && !problem && <div className="cap-empty">{t('还没有按钮。')}</div>}
      {BUTTON_SLOTS.filter((slot) => buttons.some((button) => button.slot === slot)).map((slot) => (
        <div key={slot}>
          <div className="slot-label">{SLOTS[slot].label}</div>
          {buttons
            .filter((button) => button.slot === slot)
            .map((button, index, mine) => (
              <div key={button.id} className="set-row button-row">
                <span className="button-row-icon">
                  <Glyph button={button} size={15} always />
                </span>
                <div className="set-label grow">
                  <span className="ellipsis">{button.label || t('（没有名字）')}</span>
                  <div className="muted small ellipsis">{describe(button.action)}</div>
                </div>
                <div className="set-control">
                  <button className="icon-btn" title={t('往前挪')} disabled={index === 0} onClick={() => moveButton(button.id, -1)}>
                    <Icon name="up" size={12} />
                  </button>
                  <button className="icon-btn flip" title={t('往后挪')} disabled={index === mine.length - 1} onClick={() => moveButton(button.id, 1)}>
                    <Icon name="up" size={12} />
                  </button>
                  <button className="btn" onClick={() => editButton(button)}>
                    {t('修改')}
                  </button>
                  <button className="btn" onClick={() => removeButton(button.id)}>
                    {t('删除')}
                  </button>
                </div>
              </div>
            ))}
        </div>
      ))}
      <div className="set-row">
        <div className="set-label grow">
          {t('让 Pi 来改界面')}
          <div className="muted small">{t('按钮、样式、配色都是文件夹里的文件。把想要的样子告诉 Pi，它改完这里马上生效，不用重启')}</div>
        </div>
        <div className="set-control">
          <button className="btn" title={t('在访达里指出 buttons.json')} onClick={() => api.buttonsReveal()}>
            {t('打开文件')}
          </button>
          <button className="btn primary" onClick={() => void askPiToCustomize()}>
            {t('让 Pi 来改…')}
          </button>
        </div>
      </div>
    </>
  )
}
