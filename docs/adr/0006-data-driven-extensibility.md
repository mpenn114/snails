# 0006. Data-driven content, ContentRegistry and event bus

Status: Accepted

## Context
Weapons, technologies, shell upgrades, maps and game modes will number in the dozens and should be easy to add, balance and mod without touching engine code.

## Decision
Content is described by typed definitions validated with zod and registered in a `ContentRegistry`. Definitions reference behaviour by string id; behaviours are named strategy functions registered in code. Gameplay hooks use a typed event bus (`turnStarted`, `projectileFired`, `explosion`, `snailDamaged`, `researchCompleted`, ...). A content pack is a manifest plus definitions; the base game is itself a pack (`@snails/content-base`). See [extensibility.md](../extensibility.md).

## Alternatives considered
- **Hard-coded weapons in a switch**: fast initially, unscalable and unmoddable.
- **Embedded scripting (Lua/WASM/JS eval) for mods**: more power but a sandboxing and determinism burden; deferred. Strategy ids leave room to add it later.
- **Full ECS with data components**: heavier than needed for a turn-based game with tens of entities.

## Consequences
- Balance tweaks are JSON/TS edits with schema errors caught at load.
- Mods that need new behaviour must ship code; trusted-code assumption for now.
- The registry must be frozen before a match starts and its content hash is part of the room handshake so clients and server agree.
