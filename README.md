# Snails

A turn-based 3D artillery game in the spirit of Worms, starring snails. A host computer renders
the battlefield on a big screen; players join from their Android phones over the local network
and play their turns from the phone. Shells matter: upgrades change a snail's shell, teams are
told apart by shell colour, and cracks show as health drops. A research layer unlocks new
weapons, armour and mobility. CPU players can fill empty seats.

## Quick start

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts the server, the display (big screen) and the controller (phone UI). The server
prints a join URL such as `http://192.168.1.20:3000/?room=ABCD` and the TV view for the host PC,
`http://localhost:3000/display/?room=ABCD` (with `pnpm dev` use `http://localhost:5173/` for the
display). Open the TV view in a desktop browser at any time, even mid-match, to watch the game.

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

Useful commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm ci`.

See [docs/README.md](docs/README.md) for the full documentation.
