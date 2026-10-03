# The ideas behind Pi Desktop

[简体中文](./design.zh-CN.md)

A feature list says what an app does. This page says why it does it that way: the handful of decisions that everything else follows from.

## Start from what pi is

pi is small on purpose. Its core is four tools — read, write, edit, run a command — and a short prompt. Everything else is something you add: skills, extensions, MCP servers, prompt templates. You assemble the agent you need, and nothing you did not ask for is in the way.

A desktop app is where that usually gets lost. A window invites defaults: a bundled set of tools, a memory feature that is always on, a theme, a row of buttons someone else chose. Each is reasonable on its own; together they turn a small agent into a heavy one.

So the app holds itself to one rule:

> **The window adds nothing to what pi carries. Everything a conversation carries is something you put there — and you can see it, and take it off.**

Some numbers make this concrete. They were measured once, on one machine, with pi 1.0.0, so take them as an illustration rather than a benchmark:

| | Tokens before you say anything |
|---|---|
| pi with nothing added | about 1,700 |
| The same pi, fully equipped (a few dozen skills, several extensions, MCP servers) | about 40,000 |
| What the app adds on top of either | 0 |
| A conversation after one click on *Leanest* | about 1,900 |

Nearly all of the weight comes from what was added to pi, not from pi and not from the app. The problem was never that the pieces exist; it was that you could not see them or put them down.

## Assemble each conversation

Skills, MCP servers and tools are **tiles**, all laid out flat. There are no groups to open and no folders to dig through: with dozens of skills, the thing you need is to see them all at a glance.

- **Three states for a skill.** *Auto*: pi knows the skill exists and decides when to use it — this is pi's own behavior. *On*: pi is told to read it before it starts. *Off*: pi is not told about it at all, so it costs nothing.
- **Three layers of defaults.** A choice can apply to everything, to one project, or to this conversation. Set a lean default once; open what a task needs when it needs it.
- ***Leanest*.** One click turns off everything except pi's own four tools. Save that as the global default and every conversation starts small.
- **One switch for how far pi may go.** *Read only*, *can edit files*, *full access* — these are the same four tools, turned on and off.

Under the hood a switch is nothing but one of pi's own startup flags: `--no-skills` with a `--skill` for each skill that is on, `--no-extensions` with `-e` for each extension, `--exclude-tools`, `--mcp-config`. The app does not write to pi's `settings.json`, so the pi CLI behaves exactly as before. Because flags are read at startup, a change takes effect from your next message, and the interface says so.

## Know what each piece is for

With forty skills, the hard part is not having them. It is remembering what each one does.

Every tile carries **one line that says what it is for, in your words**. A skill's own description is written for the model: long, careful, in whatever language its author used. The line on the tile is written for you, and you can rewrite it in place. For pieces that have none yet, a model can draft them — but only when you click, because that costs tokens.

## MCP without the weight

MCP servers are the heaviest thing people add: a server with sixty tools puts sixty descriptions in front of the model in every conversation. The app offers both ways of connecting them and says plainly what each costs.

- **pi's built-in MCP** finds tools when they are needed. On the machine above it added about 500 tokens. Its servers apply to every conversation.
- **The `pi-mcp-adapter` extension** lets you switch servers per conversation, and declares every tool up front. On the same machine it added about 10,500 tokens.

Per server you can also choose how its tools reach the model: found when needed, called from a script, or all declared.

## Spend context only when it buys something

The same thinking runs through the smaller features.

- **Documents become text first.** pi's read tool understands text and images. Handed a PDF, it reads bytes. In one test a question about a PDF cost about 180,000 tokens and got the wrong answer; with the text extracted first, about 5,000 and the right one. PDF, Word, PowerPoint and Excel files are converted when you attach them, and pi reads as much of the result as it needs.
- **Handing over a conversation hands over a transcript.** Drag a conversation into another and pi gets what both sides said and one line per tool call — not the raw session file with every tool output and image in it.
- **Optional things are off.** Automatic titles cost about 150 tokens each, so they are off until you turn them on. Nothing arrives pre-filled.

## A place for everything

The input box holds only what writing a message needs: attach, model, send. *What this conversation carries* is a different question, so it lives somewhere else — a narrow column of icons beside the chat, one icon for one thing. Settings pages have no paragraph of explanation at the top; a row gets one short line at most.

The aim is that you can tell what a control is for from where it sits.

## The same idea, applied to the interface

If pi leaves the agent to you, the app should leave the interface to you.

- **No themes and no default buttons.** The app ships looking plain. You bring the background image and the colors; you add the buttons, in six places of the interface, and decide what each one does.
- **Every part can be hidden.** The sidebar entries, the icons, the buttons in the title bar, the tabs of the side panel.
- **It is all plain files.** Buttons are `buttons.json`, styles are `custom.css`, palettes are `skins/*.json`. The app watches them and applies a change at once.
- **So pi can do it for you.** *Ask pi* hands pi a short guide to those files. "Add a button above the input box that runs the tests" becomes an edit to a JSON file, and the button appears while pi is still answering.

Freedom like that needs a floor rather than a fence. Whatever you choose, the interface stays usable: colors are nudged until text is readable, less of a background image shows when it clashes with the theme, a button that is written wrongly is skipped and reported, and one menu item puts everything back.

## Nothing is locked in

The app is a window onto pi's own files. Sessions, credentials, models, skills and MCP configuration are the same ones the CLI uses. Saved commands are pi's prompt templates. Trust decisions go into pi's `trust.json`. Moving a conversation to another project rewrites the session file the way pi expects, so the CLI sees it under the new project too.

Close the app and carry on in a terminal, or the other way round. If you stop using it, nothing of yours is left behind in a format only it can read.

## Is this only about pi?

The ideas are not. An agent assembled from pieces you can see and switch, context spent only where it buys something, an interface made of plain files that the agent itself can edit — none of that depends on pi. Any agent that is built from tools, skills and a protocol could sit behind a window like this.

The app, today, does depend on pi. It speaks pi's RPC protocol, reads pi's session files, and turns its switches into pi's startup flags. pi was the natural first fit because it is built the same way: small, and assembled by its user. Putting another agent behind the same window would mean an adapter for those three things. That adapter does not exist yet.
