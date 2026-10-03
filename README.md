<h1 align="center">Pi Desktop</h1>

<p align="center">An unofficial desktop app for the <a href="https://github.com/earendil-works/pi">pi coding agent</a>, for macOS.</p>

<p align="center">
  <a href="https://github.com/sedifr/pi-desktop/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/sedifr/pi-desktop/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Platform: macOS" src="https://img.shields.io/badge/platform-macOS-lightgrey.svg">
</p>

<p align="center"><b>English</b> · <a href="./README.zh-CN.md">简体中文</a></p>

![Pi Desktop: a conversation, with your own buttons above the input box](docs/screenshots/main.png)

Pi Desktop puts a window around pi. It uses pi's own local configuration and session files, so conversations, models, skills and MCP servers are shared with the pi CLI: what you did in one shows up in the other. The app bundles its own copy of pi, so nothing else has to be installed.

pi is deliberately small and leaves the rest to you. The app treats the interface the same way. It brings what pi can do into view, and leaves how it looks and what sits where to you: no themes of its own, no buttons you did not put there, every part can be hidden or moved — and you can ask pi to change the interface for you.

> **Status**: early. macOS only, developed on Apple silicon. The download is not signed by Apple, so macOS asks before opening it the first time — see [Download](#download).

## Highlights

**Talking to pi**

- Every pi session on your machine, grouped by project. `⌘K` searches titles and everything that was said; pin, rename, or drag a conversation to another project.
- You can see it working: thinking streams live, a running tool shows its latest output, and a status line tells thinking from stuck.
- Send a message while it works to steer it, queue messages and take them back, edit a message you already sent, or regenerate an answer. Replaced turns stay in the session file as a branch.
- `/` for commands and skills, `@` for files, `!` to run a shell command yourself. Quote parts of an answer and reply point by point. Attach images, PDF, Word, PowerPoint and Excel files.

**Deciding what a conversation carries**

- Every skill, MCP server and tool is a tile with a one-line description you can rewrite in your own words. Turn each on or off per conversation, and save the setup as the default for a project or for everything.
- *Leanest* starts a conversation with almost nothing but pi itself, so the opening context stays small.
- One switch for *read only*, *can edit files* or *full access*.
- Browse pi's package catalog and install with one click, or install from npm, git or a folder.
- Sign in with a subscription, add an API key, or add a compatible endpoint. A dot shows whether each sign-in still works. Cost, tokens, cache hits and context use are one click away.

**Around the conversation**

- A side panel with the project's files, the uncommitted changes, a small browser for pages running on your Mac, and a terminal.
- A page for every image generated in any conversation, a chip for sub-agents, several windows, and a notification when an answer finishes in the background.

**Making it yours**

- Your own buttons in six places of the interface. A button can say something you say often, run a command or a skill, run a shell command, open a page or a file, use one of the app's functions, or switch model, reasoning level and access level.
- Your own background image, accent color and tint; a palette file; a CSS file. Any part of the interface can be hidden, and the conversation list and the icon column can move to the right.
- Buttons, styles and palettes are plain files that the app watches, so pi can edit them for you and the change shows up at once.

The complete list is in [docs/features.md](docs/features.md).

| | |
|---|---|
| ![The skills of a conversation, each with a one-line description](docs/screenshots/skills.png) | ![Settings: your own buttons and where they sit](docs/screenshots/layout.png) |
| Skills for this conversation: *auto*, *on* or *off* | Your own buttons, and what is shown where |

![The same conversation with a background image and colors taken from it](docs/screenshots/appearance.png)

## Getting started

### Download

Get `Pi Desktop-…-arm64.dmg` from the [latest release](https://github.com/sedifr/pi-desktop/releases/latest), open it, and drag **Pi Desktop** into Applications. It needs an Apple silicon Mac with macOS 13 or later, and nothing else: the app carries its own copy of pi.

The build is not signed with an Apple developer certificate, so macOS refuses to open it the first time. Either:

- open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to Pi Desktop (on macOS 14 and earlier, right-clicking the app and choosing *Open* works too); or
- remove the download flag in Terminal: `xattr -dr com.apple.quarantine "/Applications/Pi Desktop.app"`.

If you would rather not run a binary you did not build, run it from source or build it yourself — both are below.

### Run from source

You need macOS and Node.js 22.19 or newer. The pi CLI does not have to be installed.

```bash
git clone https://github.com/sedifr/pi-desktop.git
cd pi-desktop
npm install
npm run build
npx electron .
```

### Build the app

```bash
npm run pack
```

puts `Pi Desktop.app` in `release/mac-arm64/`. `npm run dist` also makes a `.dmg` and a `.zip`.

- The app is signed only for local use (there is no Apple developer certificate behind it). On the Mac that built it, it just runs; a copy moved to another Mac has to be allowed once, as described under [Download](#download).
- For the same reason it cannot update itself. *Settings → About → Check for updates* tells you when a newer release exists and takes you to the download page.
- If the project sits in a folder synced by iCloud Drive (Desktop and Documents often are), signing fails on the attributes the sync adds. Build somewhere else: `npm run pack -- -c.directories.output=/tmp/pi-desktop-release`.

### First steps

1. **Add a project folder.** Click the `+` next to *Projects* in the sidebar and choose the folder you want pi to work in.
2. **Connect a model.** Open *Settings → Models*. Pick a provider and either sign in or paste an API key. A green dot means it works.
3. **Start a conversation.** Type in the box at the bottom and press Enter. Shift+Enter adds a new line.
4. **Choose skills and tools.** Click an icon in the column left of the chat (skills, MCP, tools). Changes apply to the current conversation from the next message on.
5. **Save what you keep repeating.** Open *Settings → Commands*, write the request once, and run it later with `/name` — or make it a button in *Settings → Layout*.

If you already use the pi CLI, your existing sessions, models, skills and MCP servers show up right away.

### Project trust

pi loads a project's own configuration (`.pi/skills`, `.pi/prompts`, `.pi/extensions`, `.pi/mcp.json`, and so on) only after you trust that folder. When a project has such files and no decision is saved, the app shows a prompt above the input box. Choosing *Trust and load* saves the decision in pi's `~/.pi/agent/trust.json`, the same file the CLI uses. You can change it later from the `···` menu in the title bar. Project extensions can run code on your computer, so only trust projects whose source you know.

## Making it yours

Everything that shapes the interface is a plain file in `~/.pi/agent/desktop/`:

| File | What it controls |
|---|---|
| `buttons.json` | Your own buttons: where each one sits, what it is called, what it does |
| `custom.css` | Any visual change: colors, fonts, spacing, hiding or moving parts |
| `skins/*.json` | Complete color palettes, a light and a dark version each |

You can edit them in *Settings → Appearance* and *Settings → Layout*, by hand, or by telling pi what you want: *Settings → Layout → Ask pi* opens a conversation and hands pi the guide written for it. The app watches these files, so a change applies at once, in every window. The formats are described in [`resources/customize-guide.md`](resources/customize-guide.md) — the same guide pi gets.

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

## Development

```bash
npm run dev          # run with hot reload
npm run typecheck    # TypeScript
npm run i18n:check   # every interface string has an English translation
npm run build        # production build into out/
```

Comments in the source and the interface strings are written in Chinese; the English interface comes from `src/shared/locales/en.ts`. [CONTRIBUTING.md](CONTRIBUTING.md) explains the layout of the code, how to test without touching your own pi data, and the few rules the project keeps.

## Limitations

- macOS only. Windows and Linux are untested.
- The packaged app is not notarized, so it cannot update itself and other people's Macs ask for confirmation on first launch.
- Switching MCP servers per conversation relies on the `pi-mcp-adapter` extension, which declares every tool up front and so costs tokens in every conversation. pi's built-in MCP support finds tools on demand and costs almost nothing, but its servers apply to every conversation.
- Turning an extension off for a conversation restarts pi with the extensions the app knows about. Packages declared only in a project's `.pi/settings.json` are not carried over in that case.
- Sign-in for remote MCP servers works with pi's built-in MCP support. Servers that need a pre-registered OAuth client are configured in `mcp.json` by hand.
- Built-in parts of the interface can be hidden but not yet moved between places, and new panels cannot be added without changing the source.

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). For security problems, see [SECURITY.md](SECURITY.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE). This project is not affiliated with the authors of pi. It builds on [pi](https://github.com/earendil-works/pi), which does all the actual work.
