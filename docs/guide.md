# Using Pi Desktop

[简体中文](./guide.zh-CN.md)

What you need after installing: the first steps, how project trust works, the files that shape the interface, the keyboard shortcuts, and where everything is stored. For what the app can do, see [features.md](features.md); for why it is built this way, [design.md](design.md).

## First steps

1. **Add a project folder.** Click the `+` next to *Projects* in the sidebar and choose the folder you want pi to work in.
2. **Connect a model.** Open *Settings → Models*. Pick a provider and either sign in or paste an API key. A green dot means it works.
3. **Start a conversation.** Type in the box at the bottom and press Enter. Shift+Enter adds a new line.
4. **Choose skills and tools.** Click an icon in the column left of the chat (skills, MCP, tools). Changes apply to the current conversation from the next message on.
5. **Save what you keep repeating.** Open *Settings → Commands*, write the request once, and run it later with `/name` — or make it a button in *Settings → Layout*.

If you already use the pi CLI, your existing sessions, models, skills and MCP servers show up right away.

## Updating

The app does not update itself. *Settings → About → Check for updates* tells you when there is a new release; download it and replace the app, or, if you installed with Homebrew, run `brew upgrade --cask pi-desktop`. Your sessions and settings live in `~/.pi/agent/` and are not touched.

## Project trust

pi loads a project's own configuration (`.pi/skills`, `.pi/prompts`, `.pi/extensions`, `.pi/mcp.json`, and so on) only after you trust that folder. When a project has such files and no decision is saved, the app shows a prompt above the input box. Choosing *Trust and load* saves the decision in pi's `~/.pi/agent/trust.json`, the same file the CLI uses. You can change it later from the `···` menu in the title bar. Project extensions can run code on your computer, so only trust projects whose source you know.

## Making it yours

Everything that shapes the interface is a plain file in `~/.pi/agent/desktop/`:

| File | What it controls |
|---|---|
| `buttons.json` | Your own buttons: where each one sits, what it is called, what it does |
| `custom.css` | Any visual change: colors, fonts, spacing, hiding or moving parts |
| `skins/*.json` | Complete color palettes, a light and a dark version each |

You can edit them in *Settings → Appearance* and *Settings → Layout*, by hand, or by telling pi what you want: *Settings → Layout → Ask pi* opens a conversation and hands pi the guide written for it. The app watches these files, so a change applies at once, in every window. The formats are described in [`resources/customize-guide.md`](../resources/customize-guide.md) — the same guide pi gets.

None of this can make the interface unusable: a button that is written wrongly is skipped and reported, palette files only accept color values, colors that are too light or too dark are adjusted until they are readable, and *View → Reset Appearance* brings back the original.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `⌘N` | New conversation |
| `⌘⇧N` | New window |
| `⌘O` | Add a project folder |
| `⌘,` | Settings |
| `⌘K` | Search conversations |
| `⌘F` | Find in the current conversation |
| `⌘B` | Show or hide the sidebar |
| `⌥⌘B` | Show or hide the side panel |
| `⌘/` | Open commands |
| `⌘⇧M` | Switch model |
| `⌘⇧C` | Copy the last answer |
| `⌘.` or `Esc` | Stop the answer in progress |
| `Enter` / `⇧Enter` | Send / new line |
| `!` / `!!` at the start | Run a shell command (with / without passing the output to pi) |
| `⌥Enter` | While answering: handle this message after everything is done |

## Where things are stored

| What | Where |
|---|---|
| Sessions, credentials, models, skills, MCP config | pi's own directory, `~/.pi/agent/` |
| Commands (prompt templates) | `~/.pi/agent/prompts/`, or `.pi/prompts/` inside a project |
| Project trust decisions | `~/.pi/agent/trust.json` |
| MCP servers | `~/.pi/agent/mcp.json` |
| On/off choices for skills, MCP, and tools | `~/.pi/agent/desktop/capabilities.json` |
| One-line descriptions shown in the app | `~/.pi/agent/desktop/summaries.json` |
| App settings | `~/.pi/agent/desktop/config.json` |
| Extensions loaded only by this app | `~/.pi/agent/desktop/extensions/` |
| Background image (the app's own copy) | `~/.pi/agent/desktop/wallpaper/` |
| Your palette files | `~/.pi/agent/desktop/skins/*.json` |
| Your own styles | `~/.pi/agent/desktop/custom.css` |
| Your own buttons | `~/.pi/agent/desktop/buttons.json` |
| The guide for pi on changing the interface (rewritten whenever it is needed) | `~/.pi/agent/desktop/CUSTOMIZE.md` |

On/off choices made in the app do not change pi's own `settings.json`, so the CLI is not affected. Signing in or adding a model does change pi's `auth.json` and `models.json`, because those are shared.

### For authors of image tools

The *Images* page finds an image when a tool result carries its saved location in `details.path` (and, optionally, the prompt in `details.prompt`). If the user chose one folder for all new images, the app passes it to pi as the `PI_DESKTOP_IMAGE_DIR` environment variable; save there when it is set.

## How it works

Each conversation is a `pi --mode rpc` child process. The app talks to it over pi's JSON protocol, and translates the on/off choices into pi's startup flags. Sign-in and model management use pi's SDK.

The app is Electron, React and TypeScript, built with electron-vite. The bundled pi version is pinned in `package.json`. To move to a newer pi, change the version, run `npm install`, and check that a conversation still works.

The interface is available in English and Simplified Chinese (*Settings → General*).

## Building the app yourself

`npm run pack` puts `Pi Desktop.app` in `release/mac-arm64/`; `npm run dist` also makes a `.dmg` and a `.zip`. The app is signed only for local use, so a copy moved to another Mac has to be allowed once in *System Settings → Privacy & Security*. If the project sits in a folder synced by iCloud Drive (Desktop and Documents often are), signing fails on the attributes the sync adds; build somewhere else with `npm run pack -- -c.directories.output=/tmp/pi-desktop-release`.
