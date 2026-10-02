# Pi Desktop

[简体中文](./README.zh-CN.md)

An unofficial desktop app for the [pi coding agent](https://github.com/earendil-works/pi). It uses the same local configuration and session files as pi, so conversations, models, skills, and MCP servers are shared with the pi CLI.

> Status: early. macOS only. Not packaged yet — you run it from source.

## What it does

- **Conversations by project**: every pi session on your machine, grouped by project folder.
- **Clean composer**: the input box holds only attachments, the model, and the send button. A small bar under it holds the project, the access level, skills, MCP servers, tools, and commands.
- **Commands**: type `/` to pick a command — your own saved prompts, skills, and extension commands, each with a one-line description. Write and edit your own in *Settings → Commands*; they are stored as pi prompt templates, so the CLI can use them too.
- **Files and images**: type `@` to reference a file in the project. Paste or drop an image to attach it.
- **Access level**: one switch for *read only*, *can edit files*, or *full access*.
- **Steer while it works**: send a message during an answer to slip it in after the current step, or hold Option to queue it until the answer is done.
- **Branch and tidy up**: start a new conversation from any earlier message, rename conversations, copy answers, compact the context, or export a conversation as a web page.
- **Pick what a conversation can use**: turn each skill, MCP server, and tool on or off per conversation, then save the setup as the default for the project or for everything. Skills have three states: *auto* (the model decides), *on* (always loaded), *off* (hidden from the model).
- **Usage at a glance**: cost, tokens, cache hit rate, and context usage for the conversation, plus totals for today and this month.
- **Models**: sign in with a subscription, add an API key, or add an OpenAI- or Anthropic-compatible endpoint. A dot next to each provider shows whether its sign-in still works.

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
4. **Choose skills and tools.** Use the bar under the input box. Changes apply to the current conversation from the next message on.
5. **Save what you keep repeating.** Open *Settings → Commands*, write the request once, and run it later with `/name`.

### Project trust

pi loads a project's own configuration (`.pi/skills`, `.pi/prompts`, `.pi/extensions`, `.pi/mcp.json`, and so on) only after you trust that folder. When a project has such files and no decision is saved, the app shows a prompt above the input box. Choosing *Trust and load* saves the decision in pi's `~/.pi/agent/trust.json`, the same file the CLI uses. You can change it later from the `···` menu in the title bar. Project extensions can run code on your computer, so only trust projects whose source you know.

### Keyboard shortcuts

| Keys | Action |
|---|---|
| `⌘N` | New conversation |
| `⌘O` | Add a project folder |
| `⌘,` | Settings |
| `⌘B` | Show or hide the sidebar |
| `⌘/` | Open commands |
| `⌘⇧M` | Switch model |
| `⌘⇧C` | Copy the last answer |
| `⌘.` or `Esc` | Stop the answer in progress |
| `Enter` / `⇧Enter` | Send / new line |
| `⌥Enter` | While answering: handle this message after everything is done |

If you already use the pi CLI, your existing sessions, models, skills, and MCP servers show up right away.

## Where things are stored

| What | Where |
|---|---|
| Sessions, credentials, models, skills, MCP config | pi's own directory, `~/.pi/agent/` |
| Commands (prompt templates) | `~/.pi/agent/prompts/`, or `.pi/prompts/` inside a project |
| Project trust decisions | `~/.pi/agent/trust.json` |
| On/off choices for skills, MCP, and tools | `~/.pi/agent/desktop/capabilities.json` |
| One-line descriptions shown in the app | `~/.pi/agent/desktop/summaries.json` |
| App settings | `~/.pi/agent/desktop/config.json` |
| Extensions loaded only by this app | `~/.pi/agent/desktop/extensions/` |

On/off choices made in the app do not change pi's own `settings.json`, so the CLI is not affected. Signing in or adding a model does change pi's `auth.json` and `models.json`, because those are shared.

## How it works

Each conversation is a `pi --mode rpc` child process. The app talks to it over pi's JSON protocol, and translates the on/off choices into pi's startup flags. Sign-in and model management use pi's SDK.

The bundled pi version is pinned in `package.json`. To move to a newer pi, change the version, run `npm install`, and check that a conversation still works.

The interface is available in English and Simplified Chinese (*Settings → Appearance*).

## Limitations

- macOS only. Windows and Linux are untested.
- No installer yet.
- MCP on/off relies on the `pi-mcp-adapter` extension.

## License

MIT. This project is not affiliated with the authors of pi.
