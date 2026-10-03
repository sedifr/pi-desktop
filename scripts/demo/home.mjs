// 生成一个演示用的假主目录：项目、对话、技能、按钮全是编的，截图和录动图只用它。
// 用法：node scripts/demo/home.mjs <en|zh> <目录>
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const [lang, target] = process.argv.slice(2)
if (!['en', 'zh'].includes(lang) || !target) {
  console.error('用法：node scripts/demo/home.mjs <en|zh> <目录>')
  process.exit(1)
}
const ZH = lang === 'zh'
const T = (en, zh) => (ZH ? zh : en)

// 只清掉自己生成过的目录，免得有人把真的主目录传进来
const MARK = '.pi-desktop-demo'
if (fs.existsSync(target)) {
  if (!fs.existsSync(path.join(target, MARK))) {
    console.error(`${target} 已经存在，而且不是这个脚本生成的，不动它`)
    process.exit(1)
  }
  fs.rmSync(target, { recursive: true, force: true })
}
fs.mkdirSync(target, { recursive: true })
// 会话文件里记的是解析过的真实路径（macOS 上 /tmp 是个链接）
const root = fs.realpathSync(target)
fs.writeFileSync(path.join(root, MARK), '')

const agent = path.join(root, '.pi/agent')
const desktop = path.join(agent, 'desktop')
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
const writeJson = (file, data) => write(file, JSON.stringify(data, null, 2) + '\n')

// ---------- 项目 ----------
const SITE = path.join(root, 'Projects/acme-website')
const NOTES = path.join(root, 'Projects', T('release-notes', '发布说明'))
write(`${SITE}/README.md`, '# Acme website\n')
write(`${SITE}/package.json`, '{ "name": "acme-website", "private": true, "scripts": { "test": "vitest run" } }\n')
write(`${SITE}/src/components/Header.tsx`, 'export function Header() {\n  return <header className="header">Acme</header>\n}\n')
write(`${SITE}/src/components/Footer.tsx`, 'export function Footer() {\n  return <footer className="footer">© Acme</footer>\n}\n')
write(`${SITE}/src/theme.css`, ':root {\n  --bg: #fff;\n  --text: #111;\n}\n')
write(`${SITE}/src/main.tsx`, "import { Header } from './components/Header'\n")
write(`${SITE}/tests/header.test.tsx`, "test('renders the header', () => {})\n")
write(`${NOTES}/2026-10.md`, T('# October\n', '# 十月\n'))

// 先提交一版，再留几处没提交的改动，「改动」页才有东西看
const env = { ...process.env, GIT_AUTHOR_NAME: 'demo', GIT_AUTHOR_EMAIL: 'demo@example.com', GIT_COMMITTER_NAME: 'demo', GIT_COMMITTER_EMAIL: 'demo@example.com', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
const git = (...args) => execFileSync('git', ['-C', SITE, ...args], { env, stdio: 'pipe' })
git('init', '-q', '-b', 'main')
git('add', '-A')
git('commit', '-q', '-m', 'Initial site')
const TOGGLE = `export function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button className="theme-toggle" aria-label={\`Switch to \${next} mode\`} onClick={() => setTheme(next)}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}`
write(`${SITE}/src/components/ThemeToggle.tsx`, TOGGLE + '\n')
write(`${SITE}/src/components/Header.tsx`, "import { ThemeToggle } from './ThemeToggle'\n\nexport function Header() {\n  return (\n    <header className=\"header\">\n      Acme\n      <ThemeToggle />\n    </header>\n  )\n}\n")
write(`${SITE}/src/theme.css`, ':root {\n  --bg: #fff;\n  --text: #111;\n}\n\n[data-theme="dark"] {\n  --bg: #111;\n  --text: #eee;\n}\n')

// ---------- 技能 ----------
const SKILLS = [
  ['browser', 'Open pages in a real browser, click, type and take screenshots.', '用真实的浏览器打开网页、点击、输入、截图。'],
  ['code-review', 'Review a diff for bugs, risky changes and missing tests.', '检查一份改动里的 bug、有风险的地方和漏掉的测试。'],
  ['db-migrations', 'Write and check database migrations.', '编写并检查数据库迁移。'],
  ['docx', 'Create and edit Word documents.', '新建和修改 Word 文档。'],
  ['figma', 'Bring Figma frames in as components.', '把 Figma 里的画板变成组件。'],
  ['i18n', 'Find untranslated strings and add the missing translations.', '找出没翻译的文字，补上缺的翻译。'],
  ['pdf', 'Read, fill in and split PDF files.', '读取、填写和拆分 PDF 文件。'],
  ['release-notes', 'Turn merged pull requests into release notes.', '把合并的改动整理成更新说明。'],
  ['test-writer', 'Write unit tests for the code you point at.', '给你指定的代码写单元测试。']
]
for (const [name, en, zh] of SKILLS) {
  const text = T(en, zh)
  write(`${root}/.agents/skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${text}\n---\n\n# ${name}\n\n${text}\n`)
}

// ---------- 自己的按钮 ----------
writeJson(`${desktop}/buttons.json`, {
  buttons: [
    { id: 'review', label: T('Review my changes', '检查我的改动'), icon: 'diff', slot: 'composer.above', action: { type: 'prompt', text: T('Review the uncommitted changes and list anything that looks wrong.', '检查还没提交的改动，把看起来不对的地方列出来。'), send: false } },
    { id: 'tests', label: T('Run the tests', '跑测试'), icon: 'play', slot: 'composer.above', action: { type: 'shell', command: 'npm test' } },
    { id: 'explain', label: T('Explain this file', '解释这个文件'), icon: 'book', slot: 'composer.above', action: { type: 'prompt', text: T('Explain what this file does: ', '解释一下这个文件是做什么的：'), send: false } },
    { id: 'term', label: T('Terminal', '终端'), icon: 'terminal', slot: 'rail', action: { type: 'app', do: 'pane:terminal' } },
    { id: 'deep', label: T('Think harder', '多想一会儿'), icon: 'brain', slot: 'header', action: { type: 'set', thinking: 'high' } },
    { id: 'start', label: T('What is in this project?', '这个项目是做什么的？'), icon: 'eye', slot: 'welcome', action: { type: 'prompt', text: T('Look through this project and tell me what it does.', '看一遍这个项目，告诉我它是做什么的。'), send: false } }
  ]
})

// ---------- 对话 ----------
const now = Date.now()
const short = () => crypto.randomBytes(4).toString('hex')
const MODEL = { provider: 'anthropic', model: 'claude-sonnet-4-5', stopReason: 'stop' }
const usage = (total) => ({ input: 5200, output: 420, cacheRead: 18400, cacheWrite: 0, cost: { total } })
const text = (value) => ({ type: 'text', text: value })
const call = (id, name, args) => ({ type: 'toolCall', id, name, arguments: args })

/** turns：['user', 文字] / ['assistant', 内容块, 花费] / ['tool', 调用号, 工具名, 输出] */
function session(cwd, name, hoursAgo, turns) {
  const at = now - hoursAgo * 3600_000
  const stamp = new Date(Math.floor(at / 1000) * 1000).toISOString()
  const id = crypto.randomUUID()
  let parent = short()
  const lines = [
    { type: 'session', version: 3, id, timestamp: stamp, cwd },
    { type: 'session_info', name, id: parent, parentId: null, timestamp: stamp }
  ]
  for (const turn of turns) {
    const message =
      turn[0] === 'user'
        ? { role: 'user', content: [text(turn[1])], timestamp: at }
        : turn[0] === 'assistant'
          ? { role: 'assistant', content: turn[1], ...MODEL, usage: usage(turn[2]), timestamp: at }
          : { role: 'toolResult', toolCallId: turn[1], toolName: turn[2], content: [text(turn[3])], isError: false, timestamp: at }
    const me = short()
    lines.push({ type: 'message', message, id: me, parentId: parent, timestamp: stamp })
    parent = me
  }
  // 和 pi 存会话的文件夹同一种起名办法
  const dir = path.join(agent, 'sessions', `--${cwd.replace(/^\//, '').replace(/[/:]/g, '-')}--`)
  const file = path.join(dir, `${stamp.replace(/[:.]/g, '-')}_${id}.jsonl`)
  write(file, lines.map((line) => JSON.stringify(line)).join('\n') + '\n')
  fs.utimesSync(file, at / 1000, at / 1000)
  return id
}
const simple = (cwd, name, hoursAgo, question, reply) => session(cwd, name, hoursAgo, [['user', question], ['assistant', [text(reply)], 0.004]])

const CODE = '```tsx\n' + TOGGLE + '\n```'
const answer = T(
  `The header now has a small theme toggle. It follows the system setting until someone clicks it, then remembers their choice.\n\n${CODE}\n\nWhat changed:\n\n- \`src/components/ThemeToggle.tsx\` is new; \`Header.tsx\` renders it on the right.\n- \`src/theme.css\` got a dark palette under \`[data-theme="dark"]\`.\n- The choice is kept in \`localStorage\`, so it survives a reload.\n\nThe three header tests still pass.`,
  `页头现在有一个小的主题开关。没人点过的时候跟着系统设置走，点过之后记住选择。\n\n${CODE}\n\n改了这些：\n\n- 新增 \`src/components/ThemeToggle.tsx\`，\`Header.tsx\` 把它放在右边。\n- \`src/theme.css\` 在 \`[data-theme="dark"]\` 下加了一套深色。\n- 选择存在 \`localStorage\` 里，刷新之后还在。\n\n页头的三个测试仍然通过。`
)

simple(SITE, T('Why is the bundle so large?', '为什么打包出来这么大'), 52, T('Why is the bundle so large?', '为什么打包出来这么大？'), T('Two charting libraries are bundled. Only one is used.', '打包进了两个图表库，实际只用了一个。'))
simple(SITE, T("Summarize yesterday's changes", '总结昨天的改动'), 28, T('Summarize what changed yesterday.', '总结一下昨天改了什么。'), T('Three commits: the pricing page, a fix for the mobile menu, and a dependency bump.', '三个提交：价格页、手机菜单的修复、一次依赖升级。'))
simple(SITE, T('Fix the flaky login test', '修掉偶尔失败的登录测试'), 3.5, T('The login test fails about one run in five. Find out why.', '登录测试大概五次里失败一次，查一下原因。'), T('It waits for a fixed 500 ms instead of for the redirect. I replaced the sleep with a wait on the URL.', '它固定等 500 毫秒，而不是等跳转完成。我把等待换成了等网址变化。'))
simple(NOTES, T('Shorten the announcement', '把公告缩短一些'), 31, T('Make the announcement half as long.', '把公告缩短一半。'), T('Done — 140 words, down from 290.', '好了，从 290 字缩到 140 字。'))
const pinned = simple(NOTES, T('Draft the October release notes', '起草十月的更新说明'), 6, T('Draft the release notes for October from the merged pull requests.', '根据已经合并的改动，起草十月的更新说明。'), T('Here is a first draft, grouped by area.', '这是第一版草稿，按模块分了组。'))
const title = T('Add a dark mode toggle', '给页头加深色模式开关')
session(SITE, title, 0.1, [
  ['user', T('Add a dark mode toggle to the header. Keep it small, and follow the system setting by default.', '给页头加一个深色模式开关。做小一点，默认跟着系统设置走。')],
  ['assistant', [text(T("I'll look at the header and the current styles first.", '我先看一下页头和现在的样式。')), call('call_1', 'read', { path: 'src/components/Header.tsx' }), call('call_2', 'read', { path: 'src/theme.css' })], 0.003],
  ['tool', 'call_1', 'read', 'export function Header() { ... }'],
  ['tool', 'call_2', 'read', ':root { --bg: #fff; --text: #111; }'],
  ['assistant', [call('call_3', 'write', { path: 'src/components/ThemeToggle.tsx' }), call('call_4', 'edit', { path: 'src/components/Header.tsx' }), call('call_5', 'edit', { path: 'src/theme.css' })], 0.004],
  ['tool', 'call_3', 'write', 'ok'],
  ['tool', 'call_4', 'edit', 'ok'],
  ['tool', 'call_5', 'edit', 'ok'],
  ['assistant', [call('call_6', 'bash', { command: 'npm test -- header' })], 0.002],
  ['tool', 'call_6', 'bash', '3 passed'],
  ['assistant', [text(answer)], 0.0051]
])

writeJson(`${desktop}/config.json`, { pinned: [pinned], extraSkillDirs: [], favoriteModels: [] })
writeJson(`${agent}/auth.json`, {})
console.log(`演示主目录：${root}`)
console.log(`启动：HOME="${root}" PI_CODING_AGENT_DIR="${agent}" PI_DESKTOP_DEBUG=1 npx electron-vite dev --remoteDebuggingPort 9339`)
