# 0001. TypeScript monorepo (pnpm workspaces, Node 22)

Status: Accepted

## Context
Snails has a server, a 3D display app, a phone controller, an Electron shell, and shared logic (simulation, protocol, content, AI). The display, controller and server must agree on message shapes exactly, and the simulation must run in Node (authoritative), in the browser (AI lookahead, prediction previews) and in tests. A small team needs one toolchain and refactors that cross package boundaries.

## Decision
Use TypeScript (`strict`) everywhere in a pnpm-workspaces monorepo on Node 22 LTS. Packages: `@snails/core`, `protocol`, `content-base`, `ai`, `server`, `display`, `controller`, `desktop`. Vite builds the browser apps, Vitest tests everything, ESLint + Prettier enforce style. Shared types (protocol messages, content definitions) are imported, never duplicated. Dependencies follow a strict one-way graph (see [architecture.md](../architecture.md)).

## Alternatives considered
- **Godot 4**: excellent engine, but phones-as-controllers over LAN, web controller serving and data-driven mod packs would all be custom work in GDScript/C#; weaker unit-testing and CI story for pure game rules.
- **Unity**: heavy install, licensing, no natural way to serve a web controller; poor fit for plain-text, diffable content packs.
- **Separate repos / polyrepo**: type drift between protocol consumers and painful lockstep releases.
- **npm/yarn workspaces, Nx, Turborepo**: pnpm gives strict dependency isolation and fast installs; task runners can be added later if build times demand.
- **JavaScript with JSDoc types**: weaker guarantees across the wire boundary.

## Consequences
- One language across host, display, phone and tests; the simulation is shareable.
- Strictness (no `any`, size limits) costs some velocity but keeps files reviewable.
- Contributors need Node 22 and pnpm (`corepack enable`).
- Performance-critical loops (meshing, SDF) must be written carefully in JS/WASM-free TS; we accept this and use Web Workers.
