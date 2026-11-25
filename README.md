# Snails

A turn-based 3D artillery game in the spirit of Worms, starring snails. A host computer renders
the battlefield on a big screen; players join from their Android phones over the local network
and play their turns from the phone. Shells matter: upgrades change a snail's shell, teams are
told apart by shell colour, and cracks show as health drops. A research layer unlocks new
weapons, armour and mobility. CPU players can fill empty seats.

## Quickstart (players)

1. Download the installer for your OS from the [GitHub Releases](https://github.com/mpenn114/snails/releases) page: `.exe` (Windows), `.dmg` (macOS) or `.AppImage` (Linux).
2. Install and launch it. The builds are unsigned, so Windows SmartScreen and macOS Gatekeeper warn on first launch; see [docs/install.md](docs/install.md) for the workarounds and [docs/troubleshooting.md](docs/troubleshooting.md) if something goes wrong. Allow network access when the firewall asks.
3. Put the host window on the TV. Each player scans the QR code with their phone camera (phones on the same Wi-Fi as the host, no app needed).
4. Pick a name and team, tap Ready, and play.

## Development

```sh
pnpm install
pnpm dev     # server + display + controller
pnpm test    # also: pnpm lint, pnpm typecheck, pnpm build, pnpm ci
```

`pnpm dev` prints a join URL such as `http://192.168.1.20:3000/?room=ABCD`; with `pnpm dev` the
TV view is `http://localhost:5173/`. Releases are described in
[docs/development/release-process.md](docs/development/release-process.md).

## How phones join

No app install is needed. Connect the phone to the same Wi-Fi as the host, scan the QR code (or
open the printed URL), enter a name and the room code, and you are in.

## Repository layout

- `apps/server` - Fastify + WebSocket host, rooms, game session
- `apps/display` - Vite + Three.js big-screen view
- `apps/controller` - Vite PWA phone controller
- `apps/desktop` - Electron wrapper and release packaging
- `packages/core` - deterministic simulation (state, turns, terrain, ballistics, events)
- `packages/protocol` - zod message schemas
- `packages/content-base` - base content pack
- `packages/ai` - CPU player strategies
- `scripts` - repo tooling

See [docs/README.md](docs/README.md) for the full documentation.
