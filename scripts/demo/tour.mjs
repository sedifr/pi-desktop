// 录说明文档开头那段演示动图的画面，录完用 gif.sh 合成。
// 用法：node scripts/demo/tour.mjs <演示主目录> <en|zh> <存画面的目录>
import path from 'node:path'
import { boot, caption, click, cursorTo, done, escape, ev, open, overlay, startRec, stopRec, viewport, wait } from './cdp.mjs'

const [home, lang, frames] = process.argv.slice(2)
const ZH = lang === 'zh'
const T = (en, zh) => (ZH ? zh : en)
const WALL = path.join(import.meta.dirname, 'wallpaper.jpg')
const STRIP = 48

// 按文字找元素：scope 里文字正好是它的、最里层的那个
const byText = (scope, text) => `[...document.querySelectorAll(${JSON.stringify(scope)})].filter(e=>e.textContent.trim()===${JSON.stringify(text)}).sort((a,b)=>a.querySelectorAll("*").length-b.querySelectorAll("*").length)[0]`
const tile = (name) => `[...document.querySelectorAll(".cap-panel .cap-tile")].find(t=>t.innerText.trim().startsWith(${JSON.stringify(name)}))`

await viewport(1200, 750 + STRIP, 1)
await boot({ lang, site: `${home}/Projects/acme-website`, prefs: { paneWidth: 400 } })
await open(T('Add a dark mode toggle', '给页头加深色模式开关'), T('Set all to Auto', '全部交给 AI'))
await overlay(STRIP)
await wait(900)

startRec(frames)
await caption(T('Pi Desktop — a window onto pi, the minimal AI agent', 'Pi Desktop：极简 Agent pi 的桌面端'))
await wait(1300)

// ① 技能是卡片，点一下切换；「最精简」一下全关
await caption(T('Every skill is a tile: Auto, On or Off', '每个技能是一张卡片：自动、开、关'))
await click(`document.querySelector('.rail [data-part="rail-skill"]')`, { after: 750 })
await click(tile('code-review'), { ms: 520, after: 520 })
await click(tile('code-review'), { ms: 100, after: 650 })
await caption(T("Leanest: one click back to pi's four tools", '「最精简」：点一下，回到 pi 自带的四个工具'))
await click(byText('.cap-panel button', T('Leanest', '最精简')), { after: 1300 })
await escape()

// ② 自己的按钮
await caption(T('Your own buttons, wherever you want them', '自己的按钮，想放哪就放哪'))
await click(byText('.slot-composer-above button', T('Explain this file', '解释这个文件')), { after: 900 })

// ③ 右侧面板：点文件就 @ 进输入框，再看没提交的改动
await caption(T('Files, changes, a browser and a terminal beside the chat', '文件、改动、浏览器、终端，就在对话旁边'))
await click(`document.querySelector('[data-part="head-pane"]')`, { ms: 600, after: 750 })
await click(byText('.pane *', 'package.json'), { ms: 540, after: 750 })
await click(byText('.pane button', T('Changes', '改动')), { ms: 520, after: 650 })
await click('[...document.querySelectorAll(".pane .change-row")].find(r=>/Header\\.tsx/.test(r.textContent))?.querySelector(".change-name")', { ms: 500, after: 1400 })
await click(`document.querySelector('.pane button[title*="⌥⌘B"]')`, { ms: 540, after: 400 })

// ④ 布局：藏起两个部件，把对话列表换到右边
await caption(T('Hide any part, or move it to the other side', '每个部件都能藏起来，或者换到另一边'))
await click(byText('.sidebar button, .sidebar .nav-item', T('Settings', '设置')), { ms: 620, after: 500 })
await click(byText('.settings-group button', T('Layout', '布局')), { ms: 540, after: 650 })
await ev('document.querySelector(".settings-content").scrollTo({top: 99999, behavior: "smooth"})')
await wait(800)
await click(byText('.part-chip', T('Images', '图片')), { ms: 540, after: 400 })
await click(byText('.part-chip', T('Search', '搜索')), { ms: 320, after: 500 })
await click('[...document.querySelectorAll(".segmented")].filter(s=>s.closest(".set-row"))[0].querySelectorAll("button")[1]', { after: 1200 })

// ⑤ 外观：选图会弹出系统的窗口，这里只做个样子，图直接交给应用
await caption(T('No built-in themes: bring your own image and colors', '没有预设主题：背景图和颜色都用你自己的'))
await click(byText('.settings-group button', T('Appearance', '外观')), { ms: 600, after: 650 })
await click(byText('.settings-content button', T('Choose an image…', '选择图片…')), { ms: 580, after: 200, fake: true })
const picked = await ev(`window.pi.wallpaperUse(${JSON.stringify(WALL)})`)
await ev(`window.__store.setLook(${JSON.stringify({ wallpaper: picked.path, wallTone: picked.tone, wallShow: 0.4, wallBlur: 0, accent: picked.color, tint: picked.color, tintStrength: 0.1 })})`)
await wait(1400)
await click(byText('.settings *', T('Close', '关闭')), { ms: 600, after: 500 })
await caption(T('pi stays small. The window is yours.', 'pi 保持小巧，界面交给你'))
await cursorTo(600, 560)
await wait(2600)
await stopRec(frames)

// 收尾：把演示主目录里改过的东西还原
await ev('window.__store.resetLook()')
await ev('window.pi.wallpaperClear()').catch(() => {})
done()
