# 0009. Stylised low-poly art direction

Status: Accepted
Date: 2026-11-23

## Context
After M3 the game runs end to end, but it still uses placeholder visuals: primitive snails, a flat
sky colour, noise-tinted terrain and basic particles. We have no artists and no art assets. Agents
can write geometry and shaders but cannot paint textures. Phones render the scene too
([ADR-0008](0008-phone-renders-game-view.md)), so the look must hold up at low GPU cost. Marching
cubes terrain produces many small facets, which read as a flaw in a realistic style.

## Decision
Use a stylised low-poly look with soft toon lighting: a miniature garden at snail scale, with
chunky rounded shapes, flat or banded shading, and colour from one fixed palette of 12 to 16
colours. Build snails, props and effects in code. Get the mood from lighting, a gradient sky and,
on the display High tier only, post-processing. A dedicated milestone (MG, between M3 and M4)
delivers it, starting with an art direction note that every later task follows.

## Alternatives considered
- **Stylised PBR with painted textures** (the earlier plan): needs authored texture and model
  assets that we cannot produce well, and costs more on phones.
- **Semi-realistic:** hardest to make look good, clashes with the comic tone, and exposes
  terrain facets.
- **Bought or CC0 asset packs:** mixed styles look cheap unless they are curated heavily; still
  allowed for props that fit the palette.

## Consequences
- Little or no texture pipeline is needed. KTX2 texture sets in [graphics.md](../graphics.md)
  become optional.
- Results depend on the palette, lighting and animation being followed consistently, so MG-01
  (art direction) and MG-03 (screenshot harness) come first.
- [snail-visuals.md](../snail-visuals.md) keeps its shell design. Its "hand-painted albedo" note
  is replaced by palette-driven shading.
