# Contributing to Pi Desktop

Thanks for taking a look. Bug reports, ideas and pull requests are all welcome.

## Before you start

- For a question about using the app, ask in [Discussions](https://github.com/sedifr/pi-desktop/discussions).
- For a bug, please open an issue with the steps that lead to it and the versions shown in *Settings → About*.
- For a larger change, open an issue first and say what you have in mind. It saves both of us a pull request that goes in a direction the project will not take.
- Problems with the agent itself (how it answers, what its tools do) belong to [pi](https://github.com/earendil-works/pi), not here.

## Setting up

You need macOS and Node.js 22.19 or newer.

```bash
git clone https://github.com/sedifr/pi-desktop.git
cd pi-desktop
npm install
npm run dev
```

`npm run dev` starts the app with hot reload for the interface. Changes to the main process (`src/main`) need a restart.

### Do not test on your own pi data

The app reads and writes pi's real configuration in `~/.pi/agent/`. When you work on anything that writes — settings, MCP servers, sign-in, moving sessions, buttons — point the app at a throwaway directory:

```bash
PI_CODING_AGENT_DIR=/tmp/pi-desktop-test npm run dev
```

`PI_DESKTOP_DEBUG=1` runs a second instance next to your normal one, with its own window state and extra logging (pi's startup flags, context menu items). Add `--remoteDebuggingPort 9339` to drive it over the Chrome DevTools Protocol.

## Checks

Run these before you open a pull request. CI runs the same three.

```bash
npm run typecheck    # TypeScript
npm run i18n:check   # every interface string has an English translation
npm run build        # production build
```

There is no unit test suite yet. Changes are verified by using the app: say in the pull request what you tried and what happened.

## How the code is laid out

| Path | What lives there |
|---|---|
| `src/main/` | The Electron main process: starting and talking to pi (`agents.ts`, `rpc.ts`), reading session files (`sessions.ts`), skills / MCP / tools (`catalog.ts`, `caps.ts`, `mcp.ts`), accounts, packages, the file-backed customization (`buttons.ts`, `skins.ts`, `wallpaper.ts`), and the IPC handlers (`index.ts`) |
| `src/preload/` | The bridge exposed to the interface as `window.pi` |
| `src/renderer/src/` | The interface (React). `store.ts` holds all state and actions; one file per area (`Chat.tsx`, `Composer.tsx`, `Sidebar.tsx`, `Settings.tsx`, …); `styles.css` is the single stylesheet |
| `src/shared/` | Types and logic used on both sides: the IPC contract (`types.ts`), translations (`i18n.ts`, `locales/en.ts`), buttons and palettes |
| `resources/` | Scripts run as child processes (sign-in helper, PDF text extraction) and the guide handed to pi for changing the interface |
| `scripts/` | Project tooling: `check-i18n.mjs`, and `demo/` for the screenshots and the demo in the README |
| `Casks/` | The Homebrew cask; the repository doubles as its own tap |

## Conventions

**Language.** Comments and interface strings are written in Chinese. An interface string is its own key: write `t('中文')`, then add the English to `src/shared/locales/en.ts`. The call has to stay on one line and the key cannot contain a line break. `npm run i18n:check` finds strings that are missing, unused, or not wrapped in `t()`. Pull requests in English are fine — if you cannot write the Chinese string, say so and we will add it.

**Comments** explain why, not what, and say it plainly. Match the density of the code around you.

**The interface belongs to the user.** pi is deliberately small and leaves the rest to its user, and the app follows it:

- Optional features are off by default. Nothing ships pre-filled: no preset themes, no default buttons.
- A new part of the interface gets a `data-part="…"` attribute and an entry in `PARTS` in `Personalize.tsx`, so it can be hidden.
- A new function of the app that is worth a button goes into `APP_ACTIONS` (`src/shared/buttons.ts`), `runAppAction` (`store.ts`), the `APP` table (`Buttons.tsx`) and `resources/customize-guide.md`. pi changes the interface by following that guide; if the guide and the code disagree, it writes buttons that do not work.
- Settings pages carry no block of explanation at the top. A row gets one short line at most; background that is useful but rarely needed goes behind a `<Hint>`.

**Reading and writing pi's files.** Before changing a file that pi or the user also edits (`mcp.json`, `models.json`, `buttons.json`), read it the way `readJsonForEdit` does: when it cannot be parsed, report it and write nothing. Never treat an unreadable file as an empty one.

**Nothing user-chosen may break the interface.** Colors are adjusted until they are readable, palette files accept only color values, malformed buttons are skipped and reported. Keep that property when you add an entry point.

**Commits** are in English, with a subject line that says what changed for the user.

## Screenshots and the demo

The pictures in `docs/` are taken from a throwaway home directory with made-up projects, sessions, skills and buttons — never from real conversations. To retake them (the GIF needs `ffmpeg`):

```bash
node scripts/demo/home.mjs en /tmp/pi-demo/en
HOME=/tmp/pi-demo/en PI_CODING_AGENT_DIR=/tmp/pi-demo/en/.pi/agent PI_DESKTOP_DEBUG=1 \
  npx electron-vite dev --remoteDebuggingPort 9339

# in a second terminal, once the window is up
node scripts/demo/stills.mjs /tmp/pi-demo/en en "$PWD/docs/screenshots"
node scripts/demo/tour.mjs /tmp/pi-demo/en en /tmp/pi-demo/frames-en
scripts/demo/gif.sh /tmp/pi-demo/frames-en docs/demo.gif
```

For the Chinese set, use `zh` instead of `en`, and write to `docs/screenshots/zh-CN` and `docs/demo.zh-CN.gif`. `tour.mjs` is the storyboard of the demo; when a part of the interface it clicks is renamed, it stops and names the element it could not find.

## Releasing

1. Set the version (`npm version x.y.z --no-git-tag-version`), add the entry to `CHANGELOG.md`, commit, tag `vx.y.z`, push both.
2. `npm run dist` builds `Pi Desktop.app`, a `.dmg` and a `.zip` into `release/`. The app is signed ad hoc; there is no Apple developer certificate behind the project, so builds are not notarized. If the checkout is inside a folder synced by iCloud Drive, build to a folder outside it: `npm run dist -- -c.directories.output=/tmp/pi-desktop-release`.
3. Create the GitHub release from the tag and attach the `.dmg` and the `.zip`. A tag that has been published is not moved; a fix after it is a new version.
4. Update `Casks/pi-desktop.rb`: the `version` and the `sha256` of the new `.dmg` (`shasum -a 256`). The file name in `url` is `Pi.Desktop-…` for 0.1.1 and `Pi-Desktop-…` from the next version on. `brew style Casks/pi-desktop.rb` checks the file. Homebrew only loads a cask from a tap like this one when it is named in full (`sedifr/pi-desktop/pi-desktop`), so keep the full name in the instructions.

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
