---
name: cursorremote-deploy-extension
description: Build and install the CursorRemote VS Code extension into the local Cursor extensions folder for dev testing. Use when the user asks to rebuild, redeploy, update, or apply extension changes, restart the relay after code edits, or install the extension to Cursor.
---

# CursorRemote — Deploy Extension (dev)

Use when local code changes need to run inside Cursor (not just `npm run dev`).

## What gets deployed

| Artifact | Role |
|----------|------|
| `dist/extension.cjs` | Extension host (spawns server) |
| `dist/server/bundle.mjs` | Relay server + DOM extractor + Telegram |
| `dist/client/*` | Mobile web UI (`app.js`, `index.html`, `styles.css`, socket.io vendor) |

`selectors.json` at extension root is **not** overwritten — copy manually only if you changed it.

## Quick deploy (macOS, Linux, Windows)

From repo root:

```bash
npm run deploy:ext
```

Runs `tsc`, copies client assets, `npm run build:ext`, then copies into:

| OS | Path |
|----|------|
| macOS / Linux | `~/.cursor/extensions/cursor-remote.cursor-remote-<VERSION>/` |
| Windows | `%USERPROFILE%\.cursor\extensions\cursor-remote.cursor-remote-<VERSION>\` |

`<VERSION>` is from `package.json` (e.g. `0.1.52`).

Equivalent: `npx tsx scripts/deploy-extension.ts`

## First-time / clean install (VSIX)

If the extension folder does not exist:

```bash
npm run package
cursor --install-extension releases/cursor-remote-<VERSION>.vsix
```

Then use `npm run deploy:ext` for subsequent dev iterations.

## After deploy — activate changes

1. **CursorRemote: Restart Server** (Command Palette) — picks up new `bundle.mjs` / client assets.
2. Hard-refresh the web client (Ctrl+Shift+R / Cmd+Shift+R).
3. **Developer: Reload Window** — only if extension host code (`extension/src/*`) changed.

## Verify

```bash
curl http://localhost:3000/health
```

(`SERVER_PORT` may differ; check extension settings / `.env`.)

## Common mistakes

- **Wrong Cursor window**: commands target the CDP-connected window. Select the correct window in the web client's window bar.
- **Editing `dist/` in the extension folder**: edit `src/` in the repo, rebuild, redeploy.
- **Only `tsc`**: server runtime is `bundle.mjs` from `build:ext`, not `dist/server/*.js`.
- **`npm run build` on Windows**: uses `rm`/`cp` and may fail; `deploy:ext` is cross-platform.

## Blurb for another agent

> CursorRemote is a Cursor extension + bundled Node relay. After changing `src/server`, `src/client`, or `extension/src`, run `npm run deploy:ext` from the repo root, then **CursorRemote: Restart Server** and hard-refresh the web client. Extension path: `~/.cursor/extensions/cursor-remote.cursor-remote-<package.json version>/` (macOS/Linux) or `%USERPROFILE%\.cursor\extensions\...` (Windows).
