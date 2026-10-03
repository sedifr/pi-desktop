# Changelog

Notable changes to Pi Desktop. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-03

The first public version. Everything is new; this is what it covers.

### Conversations

- Every pi session on the machine, grouped by project, shared with the pi CLI.
- Search across titles and everything said (`⌘K`), find inside a conversation (`⌘F`).
- Pin conversations, rename them in place, drag them to another project.
- Drag a conversation into the chat to hand it to pi as a text-only transcript.
- Several windows; the same conversation open in two windows stays in sync over one pi process.
- Automatic titles (optional), notifications when an answer finishes in the background.

### Writing and steering

- `/` commands with descriptions, `@` file references, `!` shell commands.
- Steer a running answer, queue messages and take them back.
- Edit a sent message, regenerate the last answer, start a new conversation from any message.
- Quote passages of an answer and reply to each.
- Attach images, PDF, Word, PowerPoint and Excel files; documents are turned into text first.

### What a conversation can use

- Skills, MCP servers and tools as tiles with rewritable one-line descriptions; per-conversation switches with project and global defaults; *Leanest* in one click.
- Access levels: read only, can edit files, full access.
- MCP servers: add, edit, remove, connection status, OAuth sign-in for remote servers, and a switch between pi's built-in MCP support and the `pi-mcp-adapter` extension.
- Plugins: pi's package catalog with one-click install, plus install from npm, git or a folder.
- Models: subscription sign-in, API keys, OpenAI- and Anthropic-compatible endpoints, sign-in health checks.
- Usage for the conversation and totals for today and the month.

### Around the conversation

- Side panel with Files, Changes, a Browser that fits wide pages to the panel, and a Terminal.
- A gallery of every generated image.
- A view into sub-agents.

### Making it yours

- Your own buttons in six places of the interface, with five kinds of action.
- Background image, accent color and tint, with contrast kept readable automatically.
- Palette files and a custom stylesheet, reloaded as soon as they change.
- Every built-in part can be hidden; the conversation list and the icon column can change sides.
- *Ask pi* hands pi a guide so it can change the interface itself.

### Other

- English and Simplified Chinese interface.
- Packaging with electron-builder (ad hoc signed), and a manual check for updates.

[0.1.0]: https://github.com/sedifr/pi-desktop/releases/tag/v0.1.0
