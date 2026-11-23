# Snails documentation

Snails is a turn-based 3D artillery game (Worms-like) with snails, a technology/research layer, and phones as controllers. A host computer renders the 3D view; players join from Android phones on the same LAN.

## Product and design

| Doc | Description |
| --- | --- |
| [vision.md](vision.md) | Pitch, design pillars, target experience, non-goals. |
| [game-design.md](game-design.md) | Turn structure, movement, weapons, terrain, wind, damage, win conditions, modes. |
| [technology-research.md](technology-research.md) | Research/tech tree: resources, tiers, branches, example techs, balance levers. |
| [snail-visuals.md](snail-visuals.md) | Shell visual system: materials, upgrades, team colours, damage cracks, animation. |
| [controller-ux.md](controller-ux.md) | Phone UI flows: join, lobby, team setup, turn controls, spectating. |
| [ai.md](ai.md) | CPU player design: aiming solver, target selection, research strategy, difficulty. |
| [roadmap.md](roadmap.md) | Phased milestones with exit criteria. |
| [tasks.md](tasks.md) | Task tracker: PR-sized tasks per milestone with dependencies and status. |

## Technical

| Doc | Description |
| --- | --- |
| [architecture.md](architecture.md) | Components, package graph, data flow, simulation loop, state sync. |
| [networking.md](networking.md) | LAN discovery, QR join, rooms, protocol envelope, reconnection, LAN security. |
| [graphics.md](graphics.md) | Three.js pipeline, lighting, post-processing, terrain meshing, quality tiers. |
| [extensibility.md](extensibility.md) | ContentRegistry, definition schemas, event hooks, content packs, walkthroughs. |

## Decisions (ADRs)

See [adr/README.md](adr/README.md) for the index and template.

| ADR | Title |
| --- | --- |
| [0001](adr/0001-typescript-monorepo.md) | TypeScript monorepo (pnpm, Node 22) |
| [0002](adr/0002-threejs-rendering.md) | Three.js rendering, renderer is a pure view |
| [0003](adr/0003-phone-web-controller-over-lan.md) | Phone web controller over LAN WebSocket |
| [0004](adr/0004-deterministic-simulation.md) | Deterministic simulation in `@snails/core` |
| [0005](adr/0005-destructible-sdf-terrain.md) | Destructible SDF voxel terrain |
| [0006](adr/0006-data-driven-extensibility.md) | Data-driven content and event bus |
| [0007](adr/0007-electron-desktop-distribution.md) | Electron desktop distribution |
| [0008](adr/0008-phone-renders-game-view.md) | Phones render the 3D game view (`@snails/render`) |

## Development

| Doc | Description |
| --- | --- |
| [development/coding-standards.md](development/coding-standards.md) | Size limits, strict TS, TSDoc, naming, folders, enforcement. |
| [development/testing.md](development/testing.md) | Vitest, determinism and protocol tests, golden replays, Playwright. |
| [development/release-process.md](development/release-process.md) | Semver tags, release workflow, running from a release, phone join. |
| [development/device-testing.md](development/device-testing.md) | Manual Android phone test procedure: LAN setup, latency, thermal run, reconnect, results template. |
