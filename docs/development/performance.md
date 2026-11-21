# Performance (M2-17)

Target: 60 fps at 1920x1080 on a mid-range laptop (integrated or entry dGPU), tier `high`/`medium`.
CI and the dev container have no GPU: Chromium runs WebGL on SwiftShader, so FPS there is
meaningless (2-6 fps). Use the hardware-independent numbers below, then confirm on a real device.

## Method

Harness: `apps/display/harness.html` (16-snail bot match). Build with `pnpm build:packages &&
pnpm --filter @snails/display build`, then load
`harness.html?tier=high&profile=1&seed=2&speed=2` at 1920x1080. Overlay lines:

- `draw calls` / `triangles` / `geometries` / `textures`: `renderer.info`, last frame.
- `chunks: backlog / stalls / last / worst`: terrain rebuild scheduler (main-thread cost of applying
  meshes, budget `chunkBudgetMs`).
- `cpu/frame: update / render` (`profile=1`): main-thread ms in per-frame updaters (camera, snails,
  effects, terrain scheduler) vs the CPU side of `renderer.render` (draw-call submission). GPU time
  is not included. Also exposed as `window.__perf` for scripted runs (Playwright).

Headless measurements: 1920x1080, `seed=2&speed=2`, averages of samples taken from 5 s to 16 s.

## Before / after (SwiftShader, 1920x1080)

| Metric                         | high before | high after | low before | low after |
| ------------------------------ | ----------- | ---------- | ---------- | --------- |
| Draw calls                     | 159         | 124        | 167        | 141       |
| Geometries                     | 120         | 119        | 163        | 161       |
| Textures                       | 17          | 17         | 17         | 17        |
| JS updaters ms/frame           | 2.90        | 2.09       | 1.34       | 1.17      |
| `render()` CPU ms/frame        | 4.00        | 4.15       | 2.00       | 2.38      |
| Chunk worst frame ms           | 8.8         | 5.8        | 7.7        | 5.4       |
| Chunk stalls (whole run)       | 2           | 0          | 9          | 7         |
| Triangles (see note)           | 225k        | 229k       | 280k       | 299k      |

Notes: triangle counts depend on how many chunks have been meshed at sampling time (SwiftShader
starves the main thread, so `high` still had a backlog of ~130 chunks), so they are not comparable
between runs; the terrain mesh (tetrahedral marching, already vertex-welded per chunk) dominates at
roughly 225-300k. Draw-call and updater numbers are stable. Chunk stalls come from the initial
build burst, not steady state.

## What changed

- Snail body, eye stalks and eyes merged into one vertex-coloured geometry: 5 fewer draw calls per
  snail (up to about -80 with 16 snails).
- Health bars are now centred billboards; bars and name tags scale with camera distance (constant
  on-screen size, clamped 0.4x to 8x) so they are readable at the default follow distance.
- Water plane extended to 2 km margin and fogged; scene fog now ends just before the camera far
  plane so the horizon fades into the sky instead of showing a hard edge.
- `RenderLoop.timings` and the overlay `profile=1` mode; overlay shows geometry/texture counts.
- Render loop no longer copies the updater set every frame (per-frame allocation).
- Display build: three.js split into its own `three` chunk (505 kB, 127 kB gzip; warning limit set to
  600 kB since three alone exceeds the default 500 kB).

Already in place and verified: chunk meshes have bounding spheres (frustum culled), empty chunks
produce no mesh, per-chunk edge vertex sharing, pixel ratio capped per tier, shared snail and
projectile geometries/materials. No mesh sets `castShadow`/`receiveShadow` yet, so the shadow pass
currently draws nothing; revisit shadow cost (tight shadow camera, `autoUpdate = false` with
`needsUpdate` on terrain change) when shadows are actually enabled.

## Follow-ups

- Terrain triangle budget: tetrahedral meshing yields about 2x the triangles of marching cubes;
  consider far-chunk decimation (2x coarser LOD) or a cube-based mesher.
- Per-snail name-tag textures (one canvas texture each) could become an atlas.

## How to verify 60 fps on a real mid-range laptop

1. Build and serve the display app (`pnpm --filter @snails/display build && pnpm --filter
   @snails/display preview`), open
   `http://localhost:4173/harness.html?tier=high&profile=1&seed=2&speed=2` in Chrome, fullscreen at
   1920x1080 (DPR 1; with a 4K/HiDPI panel set the OS scale so the canvas is 1080p, or compare
   `tier=medium`). Close other tabs; plug in power. Let it run 60 s so the initial chunk burst ends.
2. Read the overlay in steady state:
   - `FPS` >= 58 and `1% low` >= 45 (frame <= 16.7 ms).
   - `draw calls` <= ~150; `triangles` <= ~300k (high) / ~200k (medium/low).
   - `chunks: stalls` stays at 0 after the initial build and `worst` <= `chunkBudgetMs` (8 / 6 / 4).
   - `cpu/frame: update + render` <= ~6 ms; if FPS is low while this is small the GPU (fill rate) is
     the limit: drop to `tier=medium`/`low` (lower pixel ratio) rather than optimising JS.
3. Chrome DevTools Performance panel (record 5 s): main thread should be mostly idle with no long
   tasks; GPU lane under 16 ms. `chrome://gpu` should show hardware WebGL (not SwiftShader).
4. Scripted headless run (counts only, not FPS):
   `NODE_PATH=$(npm root -g) node apps/display/scripts/harness-screenshot.mjs <outDir> 15 "tier=high&profile=1"`.
