# Everything Pi Desktop does

[简体中文](./features.zh-CN.md)

The complete list, grouped by where you meet it. For a shorter tour see the [README](../README.md).

## Conversations

- **Conversations by project**: every pi session on your machine, grouped by project folder.
- **Find a conversation**: `⌘K` searches titles, project names and everything said in your conversations; several words narrow it down. Opening a result jumps to the message that matched. With nothing typed it lists recent conversations, so it doubles as a quick switcher.
- **Keep conversations in order**: pin the ones you keep coming back to (they stay at the top of the sidebar, and can be dragged into any order), drag a conversation onto another project when it was started in the wrong folder, double-click one to rename it, or right-click for all of these. A moved conversation continues in the new project's folder and shows up under that project in the pi CLI too; files it already wrote stay where they are.
- **Hand a conversation to another one**: drag a conversation from the sidebar into the chat and it becomes a reference pi can read. What pi gets is a text-only transcript (what both sides said, one line per tool call, no tool output dumps or images), so it reads as much as it needs instead of swallowing the raw session file. The right-click menu also copies the path of that transcript, of the session file, or the conversation ID, for handing it to a different AI.
- **More than one window**: `⌘⇧N` opens another window. Each has its own conversation in front; the same conversation open in two windows updates live in both, backed by a single pi process.
- **Know when it is done**: a system notification when an answer finishes while the window is in the background, and a dot in the sidebar for conversations that finished out of sight.
- **See sub-agents**: when the AI starts sub-agents, a chip next to the title lists them; open one to read what it did, and jump back to the main conversation.

## Writing and steering

- **Clean composer**: the input box holds only what writing a message needs: a `+` menu, the model, and the send button. The line under it says which project you are in and how far pi may go. Skills, MCP servers, tools and the marketplace live in a slim column of icons to the left of the chat, one icon each.
- **Commands**: type `/` to pick a command — your own saved prompts, skills, and extension commands, each with a one-line description. Write and edit your own in *Settings → Commands*; they are stored as pi prompt templates, so the CLI can use them too.
- **Files and images**: type `@` to reference a file in the project. Paste or drop an image to attach it.
- **Attach documents**: PDF, Word, PowerPoint and Excel files are turned into text when you attach them (the `+` menu, drag and drop, `@`, or the Files tab), and pi reads that text. Nothing extra has to be installed, it works in read-only mode, and pi reads only as much as it needs. Scanned PDFs have no text to extract, so their first pages are attached as images for a model that can see them. Other files are passed by path, as before.
- **Reply point by point**: select any part of an answer and click *Quote*; it appears in the input as its own highlighted card with a reply field underneath. Quote as many passages as you like, answer each one, and send them together. The quoted text itself cannot be edited by accident, only removed.
- **Steer while it works**: send a message during an answer to slip it in after the current step, or hold Option to queue it until the answer is done.
- **Queue and take back**: messages sent during an answer wait in a queue you can take back into the input box. Stopping an answer returns the queue too.
- **Run a command yourself**: start a message with `!` to run a shell command and show its output in the conversation; the output goes to pi with your next message. Use `!!` to keep it to yourself.
- **Change your mind**: edit a message you already sent and the conversation continues from there, or regenerate the last answer. The replaced turns stay in the session file as another branch (pi's `/tree` can go back to them). Hover a message to see when it was sent; click an image you attached to enlarge it.
- **Branch and tidy up**: start a new conversation from any earlier message, rename conversations, copy answers, compact the context, or export a conversation as a web page.

## Reading along

- **See it working**: thinking scrolls live, a running tool shows its latest output, and a line at the bottom says what is happening and for how long — so you can tell thinking from stuck.
- **Room to read**: the conversation uses the width of the window (*Settings → Appearance → Conversation width*: standard, wide or full). Code blocks are syntax-highlighted and have a copy button; `⌘F` finds text inside the current conversation; a button jumps back to the latest message after scrolling up.
- **Context under control**: a switch for automatic compaction, a *Compact now* button, and a hint when the context is nearly full.
- **Usage at a glance**: cost, tokens, cache hit rate, and context usage for the conversation, plus totals for today and this month.
- **Automatic titles** (optional, *Settings → General*): after the first exchange a model sums the conversation up in a few words, about 150 tokens each time. Off by default; it can use the conversation's model or a cheaper one you pick.
- **The small things**: right-click menus for copy and paste, the window reopens where you left it, unsent drafts survive a restart, `↑` in an empty input recalls your last message, a failed answer can be retried with one click and says in plain words what went wrong, and quitting asks first while an answer is still running.

## What a conversation can use

- **Pick what a conversation can use**: turn each skill, MCP server, and tool on or off per conversation, then save the setup as the default for the project or for everything. Skills have three states: *auto* (the model decides), *on* (always loaded), *off* (hidden from the model). *Leanest* turns everything off in one click, so a conversation starts with almost nothing but pi itself; switch on what you need, or save that as the default.
- **Your own words**: every skill, MCP server, and tool shows a one-line description you can rewrite in place, so you remember what it is for. For items that have none yet, a button lets a model draft them.
- **Access level**: one switch for *read only*, *can edit files*, or *full access*.
- **MCP servers**: add, edit, and remove servers in *Settings → MCP*, see whether each one connects, sign in to remote servers that use OAuth (your browser opens the authorization page), and choose how each server's tools reach the model (found when needed, called from scripts, or all declared up front). Secrets in environment variables and headers are never shown back. If the `pi-mcp-adapter` extension is installed, the same page switches between it and pi's built-in MCP support.
- **Marketplace**: *Settings → Plugins* browses pi's package catalog (the npm packages tagged `pi-package`, the same set as pi.dev/packages): most used first, by category, or by search, with one-click install. Nothing there is reviewed, so the page says so and asks before installing.
- **Install skills**: *Settings → Plugins → Installed* installs and removes pi packages (npm, git, or a local folder) — the same as `pi install` — and lets you add extra skill folders.
- **Models**: sign in with a subscription, add an API key, or add an OpenAI- or Anthropic-compatible endpoint. A dot next to each provider shows whether its sign-in still works. Search the model menu and star the models you use most.

## Around the conversation

- **Side panel**: next to the conversation, a tabbed panel — *Files* (see below), *Changes* (uncommitted changes in the project, with the files pi touched marked, and a diff per file), *Browser* (a small built-in browser for pages running on your Mac; localhost links in answers open there. Pages wider than the panel are scaled down to fit, or you can ask sites for their mobile version, or keep the actual size), and *Terminal* (a real shell in the project folder).
- **See the project's files**: the *Files* tab of the side panel shows the folder the conversation works in and everything inside it. Click a file (or drag it into the chat) to `@` it in the input; search by name; open or reveal any file.
- **Images in one place**: the *Images* page lists every image generated in any conversation and project — browse, search, open the conversation that made one, copy, save a copy, or move a batch to the Trash. Images an answer mentions by local path are shown inline.

## Making it yours

- **Make it look like yours**: the app is only a shell around pi and ships no themes of its own. In *Settings → Appearance* you can put your own image behind the interface, pick an accent color and tint the background (or let the colors follow the image). Every part of the interface — the sidebar entries, the icons next to the chat, the buttons in the title bar and the input, the tabs of the side panel — can be hidden on its own in *Settings → Layout*, and the conversation list and the icon column can move to the right. If that is not enough, write every color into a palette file, or add a CSS file of your own after the built-in styles. All of it changes looks only: menus, the input and cards keep their own background so the image never shows through them, less of the image shows when it is much brighter or darker than the theme, colors that are too light or too dark are adjusted until they are readable, and *View → Reset Appearance* in the menu bar brings back the original.
- **Your own buttons**: the interface has six places — above the input box, inside it, the icon column beside the chat, the title bar, the sidebar, and the empty page of a new conversation — where you can put buttons of your own. A button can say something you say often (or run a saved command or a skill; sent at once or put into the input box first), run a shell command, open a web address or a file, use one of the app's own functions (terminal, search, compact, minimal mode…), or switch to a model, reasoning level or access level in one click. Add them in *Settings → Layout* or from the `+` menu of the input box; right-click a button to change it. There are none by default.
- **Let pi change the interface**: buttons (`buttons.json`), styles (`custom.css`) and palettes (`skins/*.json`) are plain files, and the app watches them — whoever edits them, the change shows up at once, no restart. So you can simply tell pi “add a button above the input box that…” or “make the corners squarer”: *Settings → Layout → Ask pi* opens a new conversation and hands pi the guide written for it (`CUSTOMIZE.md`). A button that is written wrongly is skipped and reported in settings instead of breaking the interface.
