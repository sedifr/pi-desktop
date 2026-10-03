# Security

## Reporting a problem

Please do not open a public issue for a security problem. Use **[Report a vulnerability](https://github.com/sedifr/pi-desktop/security/advisories/new)** on the repository's Security tab; the report stays private until it is fixed. You should get an answer within a week.

Only the latest version is supported.

## What the app can do on your computer

Pi Desktop runs the pi coding agent with your user's permissions. That is the point of it, and it is also the main thing to know:

- **pi acts as you.** With *full access* it can read and change files and run commands. *Read only* and *can edit files* switch off pi's own write and shell tools, but tools that come from extensions and MCP servers are separate switches.
- **Extensions, packages and MCP servers run code.** Anything installed from the plugins page, from npm or git, or added as an MCP server runs on your machine. The catalog is not reviewed by anyone. Install only what you trust.
- **Project configuration is loaded only after you trust the folder**, using pi's own `trust.json`.
- **Your own buttons** can run shell commands. They live in `~/.pi/agent/desktop/buttons.json`; anything that can write that file — including pi, when you ask it to change the interface — can add one. A button only runs when you click it, and its tooltip shows what it does.

## How the app limits itself

- Credentials are handled by pi and stored in pi's `auth.json`. The app never shows a stored key, token, environment variable or header back in the interface.
- Pages in the built-in browser are untrusted: they run sandboxed, with context isolation, without Node.js and without a preload script, in their own storage partition, and may only navigate to `http(s)` addresses.
- `custom.css` and palette files only change how things look. Palette files accept color values and nothing else.
- The interface process is sandboxed and has no direct access to the file system.
- Configuration shared with pi (`mcp.json`, `models.json`) and `buttons.json` are not overwritten when they cannot be parsed; the app reports the problem and leaves the file alone.

## Builds

The packaged app is signed ad hoc and is not notarized by Apple: there is no developer certificate behind this project. Download it only from this repository's [releases](https://github.com/sedifr/pi-desktop/releases), and compare the checksum in the release notes; or build it from source.
