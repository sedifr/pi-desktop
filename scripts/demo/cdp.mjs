// 截图和录动图共用的部分：连上调试实例（--remoteDebuggingPort 9339），
// 往页面里放一个假光标和一条字幕，边操作边连续截图。
import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.CDP_PORT || 9339)
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = targets.find((target) => target.type === 'page')
if (!page) throw new Error('没有找到应用的窗口')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve) => (ws.onopen = resolve))
let seq = 0
const waiters = new Map()
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  if (data.id && waiters.has(data.id)) {
    waiters.get(data.id)(data)
    waiters.delete(data.id)
  }
}
export const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq
    waiters.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
export const ev = async (expression) => {
  const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (reply.result?.exceptionDetails) throw new Error(reply.result.exceptionDetails.exception?.description ?? 'eval failed')
  return reply.result?.result?.value
}
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const done = () => {
  ws.close()
  process.exit(0)
}
export const viewport = (width, height, deviceScaleFactor) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false })
export const shot = async (file) => {
  const reply = await send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, Buffer.from(reply.result.data, 'base64'))
}

/** 清掉调试实例里留着的旧设置，按指定语言重新打开 */
export async function boot({ lang, site, prefs = {} }) {
  const base = { language: lang, theme: 'dark', fontSize: 14, chatWidth: 'wide', hidden: [], railSide: 'left', sidebarSide: 'left', customCss: false, sidebarCollapsed: false, notify: false, paneOpen: false, paneTab: 'files', paneWidth: 430, ...prefs }
  await ev(`(()=>{ localStorage.clear(); localStorage.setItem("lastCwd", ${JSON.stringify(site)}); localStorage.setItem("lang", ${JSON.stringify(lang)}); localStorage.setItem("prefs", ${JSON.stringify(JSON.stringify(base))}) })()`)
  await ev('location.reload()').catch(() => {})
  await wait(4000)
  for (let i = 0; i < 80 && !(await ev('!!window.__store && !!document.querySelector(".composer, .welcome")').catch(() => false)); i++) await wait(400)
}

/** 打开一个对话，并把上一次留下的东西还原：技能全部交给 AI、输入框清空 */
export async function open(name, allAuto) {
  await ev(`(async()=>{const s=window.__store; await s.refreshSessions(); const meta=s.getState().sessions.find(m=>m.name===${JSON.stringify(name)}); if(!meta) throw new Error("没有这个对话"); await s.openSession(meta)})()`)
  await wait(1800)
  await ev(`document.querySelector('.rail [data-part="rail-skill"]').click()`)
  await wait(700)
  await ev(`[...document.querySelectorAll(".cap-panel button")].find(b=>b.textContent.trim()===${JSON.stringify(allAuto)})?.click()`)
  await wait(500)
  await escape()
  await ev(`(()=>{const el=document.querySelector(".composer textarea"); if(!el) return; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(el,""); el.dispatchEvent(new Event("input",{bubbles:true})); el.blur()})()`)
}
export async function escape() {
  await ev('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))')
  await wait(350)
}

/** 假光标、点击的水波、窗口下面的一条字幕。strip 是字幕条的高度 */
export async function overlay(strip = 48) {
  await ev(`(()=>{
    document.getElementById("demo-layer")?.remove();
    const layer = document.createElement("div"); layer.id = "demo-layer";
    layer.innerHTML = \`
      <style>
        #demo-layer { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }
        #root { height: calc(100% - ${strip}px) !important; }
        .toasts { bottom: ${strip + 16}px !important; }
        #demo-strip { position: absolute; left: 0; right: 0; bottom: 0; height: ${strip}px; background: #09090b; border-top: 1px solid rgba(255,255,255,.09); display: flex; align-items: center; justify-content: center; }
        #demo-caption { color: #f4f4f5; font: 600 17px/1.2 -apple-system, "PingFang SC", system-ui, sans-serif; letter-spacing: .15px; white-space: nowrap; opacity: 0; transform: translateY(5px); transition: opacity .25s, transform .25s; }
        #demo-caption.on { opacity: 1; transform: none; }
        #demo-cursor { position: absolute; left: 0; top: 0; width: 26px; height: 26px; transform: translate(640px, 470px); transition: transform .5s cubic-bezier(.3,.1,.2,1); filter: drop-shadow(0 1px 2px rgba(0,0,0,.55)); }
        #demo-cursor svg { transition: transform .09s; transform-origin: 4px 3px; }
        #demo-cursor.down svg { transform: scale(.86); }
        .demo-ripple { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; border: 2px solid rgba(255,255,255,.85); background: rgba(255,255,255,.18); animation: demo-ripple .5s ease-out forwards; }
        @keyframes demo-ripple { from { transform: scale(.25); opacity: 1 } to { transform: scale(1.5); opacity: 0 } }
      </style>
      <div id="demo-strip"><div id="demo-caption"></div></div>
      <div id="demo-cursor"><svg width="26" height="26" viewBox="0 0 26 26"><path d="M4 3 L4 20.5 L8.6 16.4 L11.6 23.2 L14.6 21.9 L11.7 15.2 L17.8 15.2 Z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg></div>\`;
    document.body.appendChild(layer);
  })()`)
}
export async function caption(text) {
  await ev('document.getElementById("demo-caption")?.classList.remove("on")')
  await wait(230)
  await ev(`(()=>{ const c=document.getElementById("demo-caption"); c.textContent=${JSON.stringify(text)}; c.classList.add("on"); })()`)
}
export const cursorTo = (x, y) => ev(`document.getElementById("demo-cursor").style.transform="translate(${x}px, ${y}px)"`)

// 截图和鼠标事件不能同时进行：送鼠标事件的那一下，先让截图停一停
let hold = false
let capturing = Promise.resolve()
async function mouse(...events) {
  hold = true
  await capturing
  for (const event of events) await send('Input.dispatchMouseEvent', event)
  hold = false
}

/** expr 是一段在页面里求值、得到元素的 JS */
export async function moveTo(expr, { ms = 560 } = {}) {
  const pos = await ev(`(()=>{const el=${expr}; if(!el) return null; const r=el.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}})()`)
  if (!pos) throw new Error('找不到元素: ' + expr)
  await cursorTo(pos.x - 4, pos.y - 3)
  await wait(ms)
  // 真的把鼠标也移过去，悬停的样子才会出来
  await mouse({ type: 'mouseMoved', x: pos.x, y: pos.y })
  return pos
}
/** fake：只画水波不真的点（会弹出系统窗口的按钮用） */
export async function click(expr, { ms, after = 500, fake = false } = {}) {
  const pos = await moveTo(expr, { ms })
  await wait(110)
  await ev(`(()=>{ const r=document.createElement("div"); r.className="demo-ripple"; r.style.left="${pos.x}px"; r.style.top="${pos.y}px"; document.getElementById("demo-layer").appendChild(r); setTimeout(()=>r.remove(), 600); const c=document.getElementById("demo-cursor"); c.classList.add("down"); setTimeout(()=>c.classList.remove("down"), 140) })()`)
  await wait(70)
  if (!fake) await mouse({ type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
  await wait(after)
}

/** 连续截图。每张记下时间，合成时按真实的间隔排 */
let recording = false
let loop = null
let frames = []
export function startRec(dir, every = 80) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  recording = true
  frames = []
  loop = (async () => {
    while (recording) {
      while (hold) await wait(5)
      const started = Date.now()
      const job = send('Page.captureScreenshot', { format: 'png' })
      capturing = job.catch(() => {})
      const reply = await job
      if (reply.result?.data) {
        const file = `${dir}/f${String(frames.length + 1).padStart(5, '0')}.png`
        fs.writeFileSync(file, Buffer.from(reply.result.data, 'base64'))
        frames.push({ file, at: started })
      }
      const left = every - (Date.now() - started)
      if (left > 0) await wait(left)
    }
  })()
}
export async function stopRec(dir) {
  recording = false
  await loop
  // 给 ffmpeg 的清单：每张图显示到下一张开始
  const list = frames.map((frame, i) => `file '${frame.file}'\nduration ${((i + 1 < frames.length ? frames[i + 1].at - frame.at : 80) / 1000).toFixed(3)}\n`).join('') + `file '${frames.at(-1).file}'\n`
  fs.writeFileSync(`${dir}/list.txt`, list)
  console.log(`录了 ${frames.length} 张，${((frames.at(-1).at - frames[0].at) / 1000).toFixed(1)} 秒`)
}

setTimeout(() => {
  console.error('超时')
  process.exit(2)
}, Number(process.env.CDP_TIMEOUT || 240000))
