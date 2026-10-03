import { useState } from 'react'
import { t } from '@shared/i18n'
import { DEFAULT_DARK, DEFAULT_LIGHT } from '@shared/skins'
import { ButtonsSettings } from './Buttons'
import { DEFAULT_LOOK, wallShown } from './skins'
import { api, errorText, loadCustomCss, loadSkins, resetLook, setLook, setPrefs, toast, togglePart, useApp } from './store'
import { Icon, imgUrl } from './ui'

/** 能单独开关的界面部件。只是藏起来，功能还在，随时能打开 */
const PARTS: { group: string; items: { id: string; label: string }[] }[] = [
  {
    group: t('侧栏'),
    items: [
      { id: 'side-search', label: t('搜索') },
      { id: 'side-images', label: t('图片') },
      { id: 'side-pinned', label: t('置顶的对话') }
    ]
  },
  {
    group: t('聊天区旁边的图标'),
    items: [
      { id: 'rail-skill', label: t('技能') },
      { id: 'rail-mcp', label: 'MCP' },
      { id: 'rail-tool', label: t('工具') },
      { id: 'rail-market', label: t('插件市场') }
    ]
  },
  {
    group: t('标题栏'),
    items: [
      { id: 'head-usage', label: t('用量') },
      { id: 'head-pane', label: t('右侧面板的按钮') },
      { id: 'head-agents', label: t('子代理') }
    ]
  },
  {
    group: t('输入框'),
    items: [
      { id: 'comp-thinking', label: t('推理档位') },
      { id: 'comp-strip', label: t('下面的项目和权限') }
    ]
  },
  {
    group: t('右侧面板的页签'),
    items: [
      { id: 'pane-files', label: t('文件') },
      { id: 'pane-changes', label: t('改动') },
      { id: 'pane-browser', label: t('浏览器') },
      { id: 'pane-terminal', label: t('终端') }
    ]
  }
]

const SIDES: { id: 'left' | 'right'; label: string }[] = [
  { id: 'left', label: t('左边') },
  { id: 'right', label: t('右边') }
]

/** 颜色选择框只认 #rrggbb */
const hex = (color: string | undefined, fallback: string): string => (color && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback)

/**
 * 设置里的「个性化」页：界面只是 Pi 的一层外壳，长什么样、摆哪些部件由用的人自己定。
 * 这里不预设任何风格，只给入口：一张背景图、两个颜色、每个部件的开关和位置，再往下是完全自己写的配色文件和样式文件。
 */
export function Personalize() {
  const prefs = useApp((s) => s.prefs)
  const userSkins = useApp((s) => s.userSkins)
  const look = { ...DEFAULT_LOOK, ...prefs.look }
  const hidden = prefs.hidden ?? []
  const [busy, setBusy] = useState(false)
  // 图和主题的明暗差得多时，实际露出的会比想要的少
  const shown = wallShown(look, userSkins)
  const held = look.wallpaper && (shown.light < look.wallShow - 0.005 || shown.dark < look.wallShow - 0.005)

  const pick = async () => {
    setBusy(true)
    try {
      const picked = await api.wallpaperPick()
      // 配色跟着图走：从图里取一个代表色当强调色和色调。不喜欢可以在下面单独改掉
      if (picked) setLook({ wallpaper: picked.path, wallTone: picked.tone, ...(picked.color ? { accent: picked.color, tint: picked.color } : {}) })
    } catch (error) {
      toast(errorText(error), 'error')
    }
    setBusy(false)
  }
  const fromImage = async () => {
    if (!look.wallpaper) return
    const color = await api.wallpaperColor(look.wallpaper).catch(() => undefined)
    if (color) setLook({ accent: color, tint: color })
    else toast(t('这张图里没有取到合适的颜色（可能整张都是灰的）'), 'warning')
  }
  const newSkin = async () => {
    try {
      const file = userSkins.find((skin) => skin.id === look.skin)
      await api.skinNew({ ...DEFAULT_LIGHT, ...file?.light }, { ...DEFAULT_DARK, ...file?.dark })
      toast(t('已经建好并在访达里指出来了。改完存盘就会出现在这里的列表里'))
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  return (
    <>
      <div className="set-note">
        {t('界面只是 Pi 的一层外壳。长什么样、留哪些部件，这里都由你定；不预设任何风格，什么都不动就是原样。')}
        <br />
        {t('这些改动只影响外观：部件只是藏起来或换了位置，功能都还在。调乱了，点最下面的「全部恢复默认」，或者菜单栏「显示 → 恢复默认外观」。')}
      </div>

      <ButtonsSettings />

      <div className="cap-section spaced">{t('背景图片')}</div>
      <div className="set-row">
        <div className="set-label grow">
          {look.wallpaper ? (
            <img className="wall-thumb" src={imgUrl(look.wallpaper)} alt="" />
          ) : (
            <div className="muted small">{t('选一张自己喜欢的图铺在界面底下。菜单、输入框、卡片这些有自己的底色，不会被图透过去')}</div>
          )}
        </div>
        <div className="set-control">
          <button className="btn" disabled={busy} onClick={() => void pick()}>
            {look.wallpaper ? t('换一张…') : t('选择图片…')}
          </button>
          {look.wallpaper && (
            <button
              className="btn"
              onClick={() => {
                void api.wallpaperClear().catch(() => {})
                setLook({ wallpaper: undefined, wallTone: undefined })
              }}
            >
              {t('不用了')}
            </button>
          )}
        </div>
      </div>
      {look.wallpaper && (
        <>
          <div className="set-row">
            <div className="set-label">
              {t('图片露出多少')}
              <div className="muted small">
                {t('最多露一半。图和主题的明暗差得多时会自动少露一些，保证写在背景上的字认得清')}
                {held && <> · {t('现在实际露出：浅色主题 {light}%，深色主题 {dark}%', { light: Math.round(shown.light * 100), dark: Math.round(shown.dark * 100) })}</>}
              </div>
            </div>
            <div className="set-control">
              <input type="range" min={5} max={50} step={1} value={Math.round(look.wallShow * 100)} onChange={(event) => setLook({ wallShow: Number(event.target.value) / 100 })} />
              <span className="set-value">{Math.round(look.wallShow * 100)}%</span>
            </div>
          </div>
          <div className="set-row">
            <div className="set-label">
              {t('模糊')}
              <div className="muted small">{t('图太花的时候糊一点，字更好认')}</div>
            </div>
            <div className="set-control">
              <input type="range" min={0} max={24} step={1} value={look.wallBlur} onChange={(event) => setLook({ wallBlur: Number(event.target.value) })} />
              <span className="set-value">{look.wallBlur}</span>
            </div>
          </div>
        </>
      )}

      <div className="cap-section">{t('颜色')}</div>
      <div className="set-row">
        <div className="set-label">
          {t('强调色')}
          <div className="muted small">{t('链接、按钮、高亮用的颜色。挑得太浅或太深时会自动调到看得清为止')}</div>
        </div>
        <div className="set-control">
          <input type="color" className="color-pick" value={hex(look.accent, '#2563eb')} onChange={(event) => setLook({ accent: event.target.value })} />
          {look.accent && (
            <button className="link-btn" onClick={() => setLook({ accent: undefined })}>
              {t('用默认的')}
            </button>
          )}
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">
          {t('色调')}
          <div className="muted small">{t('给整个界面的底色染上一点这个颜色。浅色和深色主题下都管用')}</div>
        </div>
        <div className="set-control">
          <input type="color" className="color-pick" value={hex(look.tint, '#8a8f98')} onChange={(event) => setLook({ tint: event.target.value })} />
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            disabled={!look.tint}
            title={t('染多重')}
            value={Math.round(look.tintStrength * 100)}
            onChange={(event) => setLook({ tintStrength: Number(event.target.value) / 100 })}
          />
          {look.tint && (
            <button className="link-btn" onClick={() => setLook({ tint: undefined })}>
              {t('不染了')}
            </button>
          )}
        </div>
      </div>
      {look.wallpaper && (
        <div className="set-row">
          <div className="set-label">
            {t('配色跟着背景图走')}
            <div className="muted small">{t('从图里取一个有代表性的颜色，同时当强调色和色调')}</div>
          </div>
          <button className="btn" onClick={() => void fromImage()}>
            {t('从图片取色')}
          </button>
        </div>
      )}

      <div className="cap-section">{t('界面上留哪些部件')}</div>
      {PARTS.map((group) => (
        <div key={group.group} className="set-row">
          <div className="set-label">{group.group}</div>
          <div className="part-list">
            {group.items.map((item) => (
              <button key={item.id} className={`part-chip ${hidden.includes(item.id) ? '' : 'on'}`} title={hidden.includes(item.id) ? t('现在藏着，点一下显示') : t('现在显示着，点一下藏起来')} onClick={() => togglePart(item.id)}>
                <Icon name={hidden.includes(item.id) ? 'x' : 'check'} size={11} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="set-row">
        <div className="set-label">{t('对话列表放在')}</div>
        <div className="segmented">
          {SIDES.map((side) => (
            <button key={side.id} className={(prefs.sidebarSide ?? 'left') === side.id ? 'on' : ''} onClick={() => setPrefs({ sidebarSide: side.id })}>
              {side.label}
            </button>
          ))}
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">{t('那列图标放在聊天区的')}</div>
        <div className="segmented">
          {SIDES.map((side) => (
            <button key={side.id} className={(prefs.railSide ?? 'left') === side.id ? 'on' : ''} onClick={() => setPrefs({ railSide: side.id })}>
              {side.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cap-section">{t('完全自己来')}</div>
      <div className="set-row">
        <div className="set-label">
          {t('配色文件')}
          <div className="muted small">{t('把每一个颜色都写进一个文件，浅色、深色各一版。可以自己写，也可以让 Pi 帮你写，或者拿别人做好的')}</div>
        </div>
        <div className="set-control">
          <select className="field" value={userSkins.some((skin) => skin.id === look.skin) ? look.skin : ''} onChange={(event) => setLook({ skin: event.target.value || undefined })}>
            <option value="">{t('不用')}</option>
            {userSkins.map((skin) => (
              <option key={skin.id} value={skin.id}>
                {skin.name}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => void newSkin()}>
            {t('新建一份…')}
          </button>
          <button className="icon-btn" title={t('重新读取')} onClick={() => void loadSkins()}>
            <Icon name="refresh" size={13} />
          </button>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">
          {t('自己写的样式')}
          <div className="muted small">{t('一个 CSS 文件，排在自带样式的后面：字体、圆角、间距、每个部件的样子都能改。文件里列了各个部件的名字')}</div>
        </div>
        <div className="set-control">
          <div className="segmented">
            <button className={prefs.customCss ? '' : 'on'} onClick={() => setPrefs({ customCss: false })}>
              {t('关')}
            </button>
            <button className={prefs.customCss ? 'on' : ''} onClick={() => setPrefs({ customCss: true })}>
              {t('开')}
            </button>
          </div>
          <button className="btn" onClick={() => api.customCssReveal()}>
            {t('打开文件')}
          </button>
          <button className="icon-btn" title={t('重新读取')} onClick={() => void loadCustomCss().then(() => toast(t('已重新读取')))}>
            <Icon name="refresh" size={13} />
          </button>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label grow">
          {t('全部恢复默认')}
          <div className="muted small">{t('背景图、颜色、部件的开关和位置、自己写的样式，都回到最初的样子。配色文件和样式文件本身不会被删')}</div>
        </div>
        <button className="btn" onClick={resetLook}>
          {t('恢复默认')}
        </button>
      </div>
    </>
  )
}
