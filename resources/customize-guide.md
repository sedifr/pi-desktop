# Customizing Pi Desktop

Pi Desktop is only a shell around pi. What it looks like and which buttons it shows are described by plain files **in the folder this document is in** (normally `~/.pi/agent/desktop/`). Edit those files and the running app picks the change up at once — no restart, no reload.

| File | What it controls |
| --- | --- |
| `buttons.json` | The user's own buttons: where each one sits, what it is called, what it does |
| `custom.css` | Any visual change: colors, fonts, spacing, corner radius, hiding or moving parts |
| `skins/*.json` | Complete color palettes (a light and a dark version each) |

This document is rewritten by the app every time it is needed. Do not edit it.

## Ground rules

- Change only these files. Never edit the app's own source or its installation.
- Read a file before changing it and keep everything the user did not ask you to change.
- `buttons.json` must stay valid JSON: no comments, no trailing commas.
- `custom.css` only takes effect when the switch is on: *Settings → Personalize → Your own styles* (设置 → 个性化 → 自己写的样式). When the user asked Pi to change the interface from that settings page, the app has already turned it on.
- Answer in the language the user writes in. When you are done, say in one or two sentences what you changed and where it shows up. If something cannot be done with these files, say so instead of approximating.
- If the result is unusable, the user can undo everything visual with *View → Reset Appearance* (显示 → 恢复默认外观). Buttons are removed by deleting them from `buttons.json` or by right-clicking them in the app.

## buttons.json

```json
{
  "buttons": [
    {
      "id": "review",
      "label": "检查改动",
      "icon": "diff",
      "slot": "composer.above",
      "action": { "type": "prompt", "text": "检查暂存区的改动，列出有问题的地方。", "send": true }
    }
  ]
}
```

- `id` — any short unique name made of letters, digits, `-` or `_`.
- `label` — the text on the button (at most 40 characters). In icon-only places it becomes the tooltip.
- `icon` — optional. Either one of the built-in names below, or one or two characters / one emoji, which is shown as is.
- `slot` — where the button sits (see the table).
- `action` — what happens on click (see below).
- Order in the array is the order on screen within a slot.
- A button that is missing a label and an icon, has an unknown action, or lacks what its action needs is skipped; the app reports how many were skipped in *Settings → Personalize*.

### Slots

| `slot` | Where | Looks like | 界面上叫 |
| --- | --- | --- | --- |
| `composer.above` | A row right above the input box | icon + label | 输入框上方 |
| `composer.bar` | Inside the input box, next to the `+` | icon + label, compact | 输入框里 |
| `rail` | The column of icons beside the chat | icon only | 聊天区旁边那列图标 |
| `header` | The title bar, on the right | icon only | 标题栏 |
| `sidebar` | The sidebar, under New chat / Search / Images | icon + label, full width | 侧栏 |
| `welcome` | The empty page of a new conversation | large, icon + label | 新对话的空白页 |

Put what is used while typing in `composer.above`; put a few things that are always needed in `rail` or `header` (they need a recognizable icon, because the label is hidden there); put conversation starters in `welcome`.

### Built-in icon names

`plus` `edit` `folder` `file` `search` `terminal` `globe` `external` `image` `star` `chart` `tool` `brain` `refresh` `shield` `slash` `copy` `chat` `quote` `store` `hash` `pin` `branch` `sidebar` `panel` `diff` `spark` `plug` `gear` `sliders` `check` `trash` `stop` `bolt` `play` `book` `mail` `calendar` `code` `clock` `list` `flag` `heart` `home` `send` `eye` `download` `link` `up` `down` `left` `right` `x` `more`

### Actions

**Say something to pi**

```json
{ "type": "prompt", "text": "把上面的回答整理成一份清单。", "send": true }
```

`send: true` sends it at once. With `send: false` (or left out) the text is put into the input box so the user can finish the sentence — use this for requests that need details. To run a saved command or a skill, start the text with it: `"/skill:my-skill"`, `"/review src/"`.

**Run a shell command** (output appears in the conversation)

```json
{ "type": "shell", "command": "git status --short", "quiet": false }
```

With `quiet: true` the output is shown to the user but not passed on to the model.

**Open a page, file or folder**

```json
{ "type": "open", "target": "https://example.com" }
```

An `http(s)` address opens in the browser tab of the side panel. A path (absolute, or starting with `~/`) opens with its default application.

**Use a function of the app**

```json
{ "type": "app", "do": "pane:terminal" }
```

| `do` | Does | 界面上叫 |
| --- | --- | --- |
| `new` | Start a new conversation in the current project | 新对话 |
| `newWindow` | Open another window | 新开一个窗口 |
| `addProject` | Add a project folder | 添加项目文件夹 |
| `search` | Search conversations | 搜索对话 |
| `find` | Find text in the current conversation | 在对话里查找 |
| `commands` | Open the list of slash commands | 快捷指令 |
| `model` | Open the model picker | 选模型 |
| `compact` | Compact the context now | 压缩上下文 |
| `copyLast` | Copy the last answer | 复制上一条回答 |
| `export` | Export the conversation as a web page | 导出成网页 |
| `rename` | Rename the conversation | 改名 |
| `stop` | Stop the running answer | 停止 |
| `minimal` | Turn off all skills, MCP servers and extensions for this conversation | 最精简 |
| `pane:files` `pane:changes` `pane:browser` `pane:terminal` | Open that tab of the side panel | 文件 / 改动 / 浏览器 / 终端 |
| `togglePane` | Show or hide the side panel | 右侧面板 |
| `toggleSidebar` | Show or hide the sidebar | 侧栏 |
| `images` | The gallery of generated images | 图片 |
| `market` | The package marketplace | 插件市场 |
| `settings` | Settings | 设置 |

**Switch model, reasoning level or access level** (any combination)

```json
{ "type": "set", "model": "anthropic/claude-sonnet-4-5", "thinking": "high", "access": "read" }
```

`model` is `provider/model-id` as shown by `pi --list-models`. `thinking` is one of the levels the model offers (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`). `access` is `read` (read files only), `edit` (read and change files, no commands) or `full`.

## custom.css

Appended after the app's own styles, so anything written here wins. Prefer changing variables over overriding rules — variables keep light and dark themes working.

**Variables** (set them on `:root`; for a dark-only value wrap it in `@media (prefers-color-scheme: dark)`):

- Colors: `--bg` `--bg-side` `--bg-soft` `--bg-hover` `--bg-active` `--border` `--border-strong` `--text` `--text-2` `--text-3` `--accent` `--accent-soft` `--danger` `--invert` `--invert-text`
- Corner radius: `--r-xs` `--r-sm` `--r-md` `--r-lg` `--r-xl` `--r-pill`
- Fonts: `body { font-family: … }`, and `--mono` for code and the terminal

**Parts:**

| Selector | Part |
| --- | --- |
| `.sidebar` | conversation list |
| `.rail` | icon column beside the chat |
| `.header` | title bar |
| `.chat-column` | conversation text |
| `.user-bubble` | the user's messages |
| `.turn` | one answer |
| `.composer` | input box |
| `.composer-strip` | the line under the input box |
| `.pane` | side panel |
| `[data-slot="composer.above"]` (any slot name) | the place holding the user's buttons |
| `[data-button="review"]` (a button's `id`) | one of the user's buttons |

**Built-in parts that can be hidden** — each carries `data-part`:

`side-search` `side-images` `side-pinned` `rail` `rail-skill` `rail-mcp` `rail-tool` `rail-market` `head-usage` `head-pane` `head-agents` `comp-thinking` `comp-strip` `pane-files` `pane-changes` `pane-browser` `pane-terminal`

```css
/* hide a part */
[data-part="head-usage"] { display: none !important; }
/* squarer corners everywhere */
:root { --r-md: 6px; --r-lg: 8px; --r-xl: 10px; }
/* make one button stand out */
[data-button="review"] { background: var(--accent-soft); color: var(--accent); }
```

Keep text readable: do not set text and background to similar colors, and do not hide the input box, the send button or the settings entry.

## skins/*.json

One file per palette. Both versions take the same keys as the color variables above, without the leading dashes. Only color values are accepted (`#rrggbb`, `rgb()`, `rgba()`, `hsl()`); anything else is ignored. Keys left out fall back to the default palette. The user picks a palette in *Settings → Personalize → Palette file* (设置 → 个性化 → 配色文件).

```json
{
  "name": "Paper",
  "light": { "bg": "#fbf7ef", "bg-side": "#f3ecdf", "bg-soft": "#efe7d8", "text": "#2b2620", "accent": "#a4532a" },
  "dark": { "bg": "#1f1c18", "bg-side": "#181512", "bg-soft": "#2a2621", "text": "#ece5d8", "accent": "#e0a070" }
}
```

## What these files cannot do

They cannot add new panels or new kinds of behavior. For new behavior (a tool, a slash command, something that runs on every message) write a pi extension or a skill instead, then put a button on it with a `prompt` action that starts with its slash command.
