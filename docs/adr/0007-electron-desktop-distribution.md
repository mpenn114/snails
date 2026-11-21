# 0007. Electron desktop distribution

Status: Accepted

## Context
Hosts are likely non-developers who want to double-click an installer, see the game on a TV and have phones connect. The host must run a Node server, serve the controller, and show the display with WebGL2/WebGPU.

## Decision
`apps/desktop` is an Electron app: the main process starts `@snails/server` in-process (or as a child process), opens a window loading the built display app, and shows the QR code/join info. `electron-builder` produces Windows (NSIS), Linux (AppImage/deb) and macOS (dmg) artifacts on tagged releases via GitHub Actions. Developers can also run server and display separately with `pnpm dev`.

## Alternatives considered
- **Tauri**: smaller binaries, but needs a Rust toolchain and an OS webview whose WebGL/WebGPU support varies; we also need a Node server.
- **Node server plus "open this URL in your browser"**: fine for developers (kept as a dev mode) but poor onboarding.
- **Native Android app as host**: underpowered for 3D destruction and TV output varies.
- **Docker / hosted server**: wrong model for LAN couch play.

## Consequences
- Large downloads (~100-150 MB) and an Electron security surface; keep `contextIsolation` on and `nodeIntegration` off in the display window.
- Code signing/notarisation is a later concern (unsigned builds show OS warnings).
- Windows Firewall prompt on first run must be explained (see [networking.md](../networking.md)).
