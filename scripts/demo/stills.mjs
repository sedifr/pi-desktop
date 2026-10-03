// 拍说明文档里的五张截图。
// 用法：node scripts/demo/stills.mjs <演示主目录> <en|zh> <输出目录>
import path from 'node:path'
import { boot, done, escape, ev, open, shot, viewport, wait } from './cdp.mjs'

const [home, lang, out] = process.argv.slice(2)
const ZH = lang === 'zh'
const T = (en, zh) => (ZH ? zh : en)
const WALL = path.join(import.meta.dirname, 'wallpaper.jpg')
const top = async () => {
  await ev('document.querySelector(".chat-scroll, .chat")?.scrollTo?.(0, 0)')
  await wait(400)
}

await viewport(1200, 674, 1.5)
await boot({ lang, site: `${home}/Projects/acme-website`, prefs: { paneWidth: 470 } })
await open(T('Add a dark mode toggle', '给页头加深色模式开关'), T('Set all to Auto', '全部交给 AI'))

// 一次对话
await top()
await shot(`${out}/main.png`)

// 技能面板
await ev(`(()=>{const b=document.querySelector('.rail [data-part="rail-skill"]'); b.dispatchEvent(new MouseEvent("mousedown",{bubbles:true})); b.click()})()`)
await wait(1500)
await ev('document.activeElement?.blur()')
await wait(200)
await shot(`${out}/skills.png`)
await escape()

// 右侧面板：「改动」页，展开一个文件
await ev(`document.querySelector('[data-part="head-pane"]').click()`)
await wait(1200)
await ev(`[...document.querySelectorAll(".pane button")].find(b=>b.textContent.trim()===${JSON.stringify(T('Changes', '改动'))}).click()`)
await wait(1500)
await ev('[...document.querySelectorAll(".pane .change-row")].find(r=>/Header\\.tsx/.test(r.textContent)).click()')
await wait(1200)
await top()
await shot(`${out}/panel.png`)
await ev(`document.querySelector('.pane button[title*="⌥⌘B"]').click()`)
await wait(500)

// 设置 → 布局
await ev('window.__store.openSettings("layout")')
await wait(1000)
await shot(`${out}/layout.png`)
await ev('window.__store.setView("chat")')
await wait(500)

// 自己的背景图和颜色
const picked = await ev(`window.pi.wallpaperUse(${JSON.stringify(WALL)})`)
await ev(`window.__store.setLook(${JSON.stringify({ wallpaper: picked.path, wallTone: picked.tone, wallShow: 0.4, wallBlur: 0, accent: picked.color, tint: picked.color, tintStrength: 0.1 })})`)
await wait(1300)
await top()
await shot(`${out}/appearance.png`)
await ev('window.__store.resetLook()')
await ev('window.pi.wallpaperClear()').catch(() => {})
done()
