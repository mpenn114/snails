# 0008. Phones render the 3D game view

Status: Accepted

## Context
Originally phones were controls-only and the host display showed the 3D world. We want a player to be able to take their whole turn from the phone alone (no TV, or a TV out of line of sight), seeing terrain, wind, snails and projectile flight.

## Decision
Extract the rendering code into `packages/render` (`@snails/render`), a Three.js view library used by both `apps/display` and `apps/controller`. Controllers receive the same snapshots, deltas, terrain edits and event stream as the display (still server-authoritative; private data such as other teams' hidden research stays filtered). The controller renders with a `mobile` quality tier. `@snails/render` depends on `@snails/protocol` (and core types only); it never owns rules.

## Alternatives considered
- **Controls-only phone** (original design): smallest bundle and lowest battery use, but requires a shared screen and gives poor aiming feedback. Remains available as a "controls only" setting that skips the renderer.
- **Video streaming from the host** (WebRTC/MJPEG): no phone GPU needs and identical visuals, but costs host GPU/encode time per phone, adds latency to aiming, uses much more bandwidth, and needs WebRTC signalling (see ADR-0003).
- **Separate simplified 2D phone view**: extra code path to maintain and diverges from the real world state.

## Consequences
- Controller bundle grows (Three.js, mesher worker); lazy-load the renderer after join.
- Bandwidth per phone equals the display's; fine on LAN, delta compression is a later optimisation.
- Mobile GPU/thermal limits require the `mobile` tier ([graphics.md](../graphics.md)).
- Controller now depends on `@snails/render`; the "controller never imports core" rule is kept (render consumes protocol types).
- Terrain is reconstructed on each phone from seed plus edits, so phones also run the mesher worker.
