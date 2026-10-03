# Pi Desktop

[简体中文](./README.zh-CN.md)

An unofficial desktop app for the [pi coding agent](https://github.com/earendil-works/pi). It uses the same local configuration and session files as pi, so conversations, models, skills, and MCP servers are shared with the pi CLI.

> Status: early. macOS only. Not packaged yet — you run it from source.

## What it does

- **Conversations by project**: every pi session on your machine, grouped by project folder.
- **Clean composer**: the input box holds a `+` menu, one *Skills & tools* button, the model, and the send button. The line under it only says which project you are in and how far pi may go.
- **See it working**: thinking scrolls live, a running tool shows its latest output, and a line at the bottom says what is happening and for how long — so you can tell thinking from stuck.
- **Commands**: type `/` to pick a command — your own saved prompts, skills, and extension commands, each with a one-line description. Write and edit your own in *Settings → Commands*; they are stored as pi prompt templates, so the CLI can use them too.
- **Files and images**: type `@` to reference a file in the project. Paste or drop an image to attach it.
- **Access level**: one switch for *read only*, *can edit files*, or *full access*.
- **Steer while it works**: send a message during an answer to slip it in after the current step, or hold Option to queue it until the answer is done.
- **Branch and tidy up**: start a new conversation from any earlier message, rename conversations, copy answers, compact the context, or export a conversation as a web page.
- **Run a command yourself**: start a message with `!` to run a shell command and show its output in the conversation; the output goes to pi with your next message. Use `!!` to keep it to yourself.
- **Queue and take back**: messages sent during an answer wait in a queue you can take back into the input box. Stopping an answer returns the queue too.
- **Context under control**: a switch for automatic compaction, a *Compact now* button, and a hint when the context is nearly full.
- **Find a conversation**: `⌘K` searches titles, project names and everything said in your conversations; several words narrow it down. Opening a result jumps to the message that matched. With nothing typed it lists recent conversations, so it doubles as a quick switcher.
- **Keep conversations in order**: pin the ones you keep coming back to (they stay at the top of the sidebar, and can be dragged into any order), drag a conversation onto another project when it was started in the wrong folder, double-click one to rename it, or right-click for all of these. A moved conversation continues in the new project's folder and shows up under that project in the pi CLI too; files it already wrote stay where they are.
- **Hand a conversation to another one**: drag a conversation from the sidebar into the chat and it becomes a reference pi can read. What pi gets is a text-only transcript (what both sides said, one line per tool call, no tool output dumps or images), so it reads as much as it needs instead of swallowing the raw session file. The right-click menu also copies the path of that transcript, of the session file, or the conversation ID, for handing it to a different AI.
- **Know when it is done**: a system notification when an answer finishes while the window is in the background, and a dot in the sidebar for conversations that finished out of sight.
- **MCP servers**: add, edit, and remove servers in *Settings → MCP*, and choose how each server's tools reach the model (found when needed, called from scripts, or all declared up front). Secrets in environment variables and headers are never shown back. If the `pi-mcp-adapter` extension is installed, the same page switches between it and pi's built-in MCP support.
- **Your own words**: every skill, MCP server, and tool shows a one-line description you can rewrite in place, so you remember what it is for. For items that have none yet, a button lets a model draft them.
- **Install skills**: *Settings → Install skills* installs and removes pi packages (npm, git, or a local folder) — the same as `pi install` — and lets you add extra skill folders.
- **Side panel**: next to the conversation, a panel with three tabs — *Changes* (uncommitted changes in the project, with the files pi touched marked, and a diff per file), *Browser* (a small built-in browser for pages running on your Mac; localhost links in answers open there), and *Terminal* (a real shell in the project folder).
- **Images in one place**: the *Images* page lists every image generated in any conversation and project — browse, search, open the conversation that made one, copy, save a copy, or move a batch to the Trash. Images an answer mentions by local path are shown inline.
- **See sub-agents**: when the AI starts sub-agents, a chip next to the title lists them; open one to read what it did, and jump back to the main conversation.
- **Pick what a conversation can use**: turn each skill, MCP server, and tool on or off per conversation, then save the setup as the default for the project or for everything. Skills have three states: *auto* (the model decides), *on* (always loaded), *off* (hidden from the model). *Leanest* turns everything off in one click, so a conversation starts with almost nothing but pi itself; switch on what you need, or save that as the default.
- **Usage at a glance**: cost, tokens, cache hit rate, and context usage for the conversation, plus totals for today and this month.
- **Models**: sign in with a subscription, add an API key, or add an OpenAI- or Anthropic-compatible endpoint. A dot next to each provider shows whether its sign-in still works. Search the model menu and star the models you use most.

## Requirements

- macOS
- Node.js 22.19 or newer
- Nothing else. The app bundles its own copy of pi; you do not need the pi CLI installed.

## Run from source

```bash
git clone https://github.com/sedifr/pi-desktop.git
cd pi-desktop
npm install
npm run build
npx electron .
```

For development with hot reload:

```bash
npm run dev
```

## First steps

1. **Add a project folder.** Click the `+` next to *Projects* in the sidebar and choose the folder you want pi to work in.
2. **Connect a model.** Open *Settings → Models*. Pick a provider and either sign in or paste an API key. A green dot means it works.
3. **Start a conversation.** Type in the box at the bottom and press Enter. Shift+Enter adds a new line.
4. **Choose skills and tools.** Click *Skills & tools* in the input box. Changes apply to the current conversation from the next message on.
5. **Save what you keep repeating.** Open *Settings → Commands*, write the request once, and run it later with `/name`.

### Project trust

pi loads a project's own configuration (`.pi/skills`, `.pi/prompts`, `.pi/extensions`, `.pi/mcp.json`, and so on) only after you trust that folder. When a project has such files and no decision is saved, the app shows a prompt above the input box. Choosing *Trust and load* saves the decision in pi's `~/.pi/agent/trust.json`, the same file the CLI uses. You can change it later from the `···` menu in the title bar. Project extensions can run code on your computer, so only trust projects whose source you know.

### Keyboard shortcuts

| Keys | Action |
|---|---|
| `⌘N` | New conversation |
| `⌘O` | Add a project folder |
| `⌘,` | Settings |
| `⌘K` | Search conversations |
| `⌘B` | Show or hide the sidebar |
| `⌥⌘B` | Show or hide the side panel |
| `⌘/` | Open commands |
| `⌘⇧M` | Switch model |
| `⌘⇧C` | Copy the last answer |
| `⌘.` or `Esc` | Stop the answer in progress |
| `Enter` / `⇧Enter` | Send / new line |
| `!` / `!!` at the start | Run a shell command (with / without passing the output to pi) |
| `⌥Enter` | While answering: handle this message after everything is done |

If you already use the pi CLI, your existing sessions, models, skills, and MCP servers show up right away.

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

On/off choices made in the app do not change pi's own `settings.json`, so the CLI is not affected. Signing in or adding a model does change pi's `auth.json` and `models.json`, because those are shared.

### For authors of image tools

The *Images* page finds an image when a tool result carries its saved location in `details.path` (and, optionally, the prompt in `details.prompt`). If the user chose one folder for all new images, the app passes it to pi as the `PI_DESKTOP_IMAGE_DIR` environment variable; save there when it is set.

## How it works

Each conversation is a `pi --mode rpc` child process. The app talks to it over pi's JSON protocol, and translates the on/off choices into pi's startup flags. Sign-in and model management use pi's SDK.

The bundled pi version is pinned in `package.json`. To move to a newer pi, change the version, run `npm install`, and check that a conversation still works.

The interface is available in English and Simplified Chinese (*Settings → Appearance*).

## Limitations

- macOS only. Windows and Linux are untested.
- No installer yet.
- Switching MCP servers per conversation relies on the `pi-mcp-adapter` extension, which declares every tool up front and so costs tokens in every conversation. pi's built-in MCP support finds tools on demand and costs almost nothing, but its servers apply to every conversation.
- Turning an extension off for a conversation restarts pi with the extensions the app knows about. Packages declared only in a project's `.pi/settings.json` are not carried over in that case.
- OAuth sign-in for remote MCP servers is not in the app yet; do it once from the pi CLI.

## License

MIT. This project is not affiliated with the authors of pi.
