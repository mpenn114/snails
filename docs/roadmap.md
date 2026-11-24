# Snails: Roadmap

Milestones are vertical slices, each ending with something you can run and demo. Exit criteria
are the gate; dates are intentionally absent.
The task-level breakdown with dependencies and status lives in [tasks.md](tasks.md).

## M0: Repo scaffold and planning (done)

Goal: monorepo, tooling, CI and planning documents.
Exit: pnpm workspace builds, lint, typecheck, `check-limits` and tests run in CI; docs and ADRs
0001 to 0007 merged.

## M1: Core sim vertical slice

Goal: a deterministic, headless game in `@snails/core`.
- Terrain SDF voxel grid with sphere carving and collapse stub.
- 2 teams, snails with health, movement, fall and drown damage.
- Turn manager (timer, phases) and one weapon (Pebble Toss), seeded wind.
- Event bus and the `ContentRegistry` skeleton.
Exit:
- Headless test plays a full 2 team match to a win from a seed and replays identically.
- Property tests for terrain carving and projectile determinism.
- 90% line coverage for `core` rules; step time under 1 ms for 4 snails and 1 projectile.

## M2: Display rendering

Goal: the host screen renders the simulation state (shared render package so the phone can reuse it).
- Terrain chunk meshing by marching cubes in a Web Worker.
- Snail placeholder meshes, projectiles, explosions and cameras (follow, free, cinematic).
- Wind particles, basic lighting and water plane.
Exit:
- A scripted match runs at 60 fps on a mid-range laptop at 1080p with 16 snails.
- Terrain edits show within 100 ms and chunk rebuild never stalls a frame over 8 ms.
- Renderer owns no game rules (lint/dependency check).

## M3: Phone controller loop over LAN, with phone rendering

Goal: end to end play from phones.
- Server: Fastify serving the controller, WebSocket rooms, QR join, LAN IP detection.
- Protocol with zod validation and versioning; reconnection and rejoin.
- Controller PWA: join, lobby, own-turn controls, waiting screen
  ([controller-ux.md](controller-ux.md)).
- **Phone renders the 3D scene** through the shared render package at a mobile quality tier, with
  follow, aim and free camera modes, minimap and HUD overlays; quality auto-scaling and battery
  saver.
- Hot-seat and one-phone-per-player modes.
Exit:
- 2 to 4 real Android phones play a full Classic match with Pebble Toss and no desktop input.
- Playing a whole turn looking only at the phone works, with the big screen as a spectator view.
- Median command-to-effect latency under 150 ms on a normal Wi-Fi; reconnect restores the turn within 3 s.
- Phone holds 30 fps or better for 20 minutes on a mid-range Android device without thermal throttling
  below that.

## MG: Art direction and graphics

Goal: replace the placeholder look with one consistent style: stylised low poly with soft toon
lighting, a miniature garden at snail scale ([ADR-0009](adr/0009-stylised-low-poly-art-direction.md)).
- Art direction note with a fixed palette, lighting values and shape language; a screenshot harness
  for reviewing every change.
- Colour pipeline (tone mapping, sRGB) and one shared stylised material factory.
- Gradient sky and warm lighting, flat-shaded terrain with strata and crater detail, garden props.
- Code-built snails: spiral shell, body and eye stalks, team patterns, animation and expressions.
- Stylised water, explosions, projectiles and aim arc; HUD and overlays matched to the palette.
- Post-processing on the display High tier only.
Exit:
- No placeholder primitives remain; reference screenshots on display High and phone Mobile are
  reviewed against the art direction note.
- Display still holds 60 fps at 1080p with 16 snails on High; phone holds 30 fps on Mobile.
- Props and effects are cosmetic only; the renderer still owns no game rules.

## M4: Weapons and content packs

Goal: the full base weapon set as data.
- `@snails/content-base` with the 10+ weapons from [game-design.md](game-design.md); crates and pickups.
- Zod-validated definitions, content pack manifest, wind and terrain materials.
- Match settings and the Classic mode complete; sudden death.
- Playtest fixes from issue #9: two-axis movement, a proper aim view, snail collisions, hot-seat
  team colours and desktop viewing.
Exit: every weapon has simulation tests and appears in a playable demo map; a new weapon can be
added with only a data file (walkthrough in [extensibility.md](extensibility.md)).

## M5: Research and tech tree

Goal: the strategic layer ([technology-research.md](technology-research.md)).
- Calcium economy, queueing, tiers, 4 branches, capstones, Research race mode.
- Research screen on the phone; private queues and reveals.
- Anti-snowball rules.
Exit: a match with research on completes in under 30 min; 20 techs implemented; balance
dashboard from headless runs shows no dominant tech (targets in the research doc).

## M6: CPU players

Goal: CPU teams ([ai.md](ai.md)).
- `CpuPlayer`, aiming solver, target selection, movement planning, 4 difficulties, 3 personalities.
- Headless AI match runner and CI gates.
Exit: a human can play against any difficulty; Mastermind beats Rookie in at least 90% of
matches; AI turn computation p99 under 250 ms on target hardware.

## M7: Shell upgrades, damage and polish

Goal: shells show tech and health ([snail-visuals.md](snail-visuals.md)), building on the MG style.
- Material tiers driven by research, decals and attachments.
- Crack shader, fragments, critical state, death shells.
- Per-weapon VFX, audio pass, accessibility, King of the Hill mode.
Exit: all four shell tiers and 4 crack states are readable at TV distance and on phone;
quality tiers hold their budgets on both display and phone ([graphics.md](graphics.md)).

## M8: Packaging and first release

Goal: tagged release v0.1.0.
- Electron desktop app bundling server and display; electron-builder for Windows, Linux, macOS.
- Release workflow, installer smoke tests, first-run LAN/firewall guidance.
- Tutorial overlay and default settings tuned.
Exit: a non-developer installs, launches and plays with friends in under 5 minutes; artifacts
are attached to a GitHub Release.

## Later

- **Online play:** relay or WebRTC room codes; latency-tolerant turn-based sync.
- **Mod loading:** user content packs from disk or a workshop-like index, with sandboxing
  rules.
- **Android TWA wrapper** (or Capacitor) for the controller in an app store.
- **Map editor:** in-game 3D terrain painter and shareable seeds.
- Replays and a spectator-share link; more modes and seasonal content.

## Open questions and risks

| Risk / question | Why it matters | Mitigation |
|---|---|---|
| Destructible 3D terrain performance (SDF grid size, meshing, collapse) | Frame spikes or memory blowups break the core feeling | Chunked grid with dirty flags, worker meshing, budgets in M2, cap map size and snails, 2.5D camera bias |
| Phone rendering cost (heat, battery, old devices) | The phone is now the primary play surface | Mobile quality tier, adaptive scaling, battery saver, 2D fallback, test early in M3 |
| Phone and Wi-Fi latency, packet loss | Perceived responsiveness; aim preview mirroring | Turn-based design tolerates lag; host authoritative; send compact aim deltas; measure in M3 |
| Terrain sync to phones | Phones need the same terrain edits as the display | Send deterministic carve events, not meshes; both sides run the sim or the same edit stream |
| Balance: research snowballing, turtling | Matches stall or are decided early | Anti-snowball levers, headless balance tests |
| Determinism across platforms (floating point) | Replays and AI lookahead rely on it | Fixed timestep, avoid platform math differences, test on all CI OSs |
| Firewalls and LAN discovery, client isolation on guest Wi-Fi | Joining must "just work" | Clear QR/URL guidance, host IP fallback, document hotspot mode |
| iOS browser support for the controller | Mixed households | Test Safari; keep to broadly supported APIs (haptics degrade gracefully) |
| Scope creep in the content system | Extensibility can swallow time | Keep the effect vocabulary small; the base game dogfoods it |
| Art pipeline for original assets | Solo or small team capacity | Stylised low poly built in code (ADR-0009), procedural shells, CC0 or original-only assets |
| Hot-seat privacy | Secret research on a shared phone | Hold-to-reveal covers; playtest |
