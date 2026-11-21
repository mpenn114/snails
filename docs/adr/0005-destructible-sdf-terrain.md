# 0005. Destructible terrain as a 3D SDF voxel grid

Status: Accepted

## Context
Artillery games live on terrain that is blown apart. We want true 3D destruction (tunnels, craters, overhangs), not a 2D heightmap, and smooth surfaces that look good with PBR and triplanar texturing.

## Decision
Terrain is a 3D signed-distance-field grid in `@snails/core`, stored in chunks. Explosions subtract spheres (and later other shapes) from the field with a smooth-min falloff; chunks touched are marked dirty and versioned. The display meshes each dirty chunk with marching cubes in a Web Worker. Collision queries (projectiles, snail movement) sample the SDF directly in core, so physics and visuals share one source of truth. Details in [graphics.md](../graphics.md).

## Alternatives considered
- **2D heightmap / bitmap terrain** (classic Worms): simple but no overhangs or true 3D.
- **Mesh boolean ops (CSG)**: expensive, fragile, hard to make deterministic.
- **Voxel blocks (Minecraft style)**: blocky look; fights the art direction.
- **Heightfield + decals**: cannot represent tunnels.

## Consequences
- Memory grows cubically with map size; maps are bounded (e.g. 256x96x256 at coarse cell size) and chunked with sparse/uniform-chunk compression.
- Network sync sends compact edit lists (centre, radius), not fields; the display rebuilds the field from the seed plus edits.
- Meshing cost is amortised via workers and dirty tracking; budgets in graphics doc.
