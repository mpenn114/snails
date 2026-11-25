# Snails: Shell Visual System

The shell is the most important visual element. It tells you team, tech level and health at a
glance, and it is where the game's personality lives. The renderer is a pure view of simulation
state ([graphics.md](graphics.md)); everything here is derived from `SnailState` and the tech data.

## Anatomy

- **Body (foot):** one smooth, continuously curved sweep (`snail/body-torso.ts`): a long, low
  foot tapering to a neat tail behind the shell, a slim neck and a rounded head raised in front of
  the shell. The cross-section has a flared, flatter sole rim in a lighter tone, so the body sits
  on the ground. Colour is a warm khaki-taupe (never flesh) with a darker back, a light rim and
  underside, and soft vertex mottling; the toon material keeps the sheen satin. Smooth normals,
  16 sides by 21 rings at LOD 0 (8 by 10 at LOD 1).
- **Face:** a small smile line and two short lower tentacles are merged into the body geometry.
- **Head and eye stalks:** two slim, smooth stalks, each with an eye on top. Stalks carry most of the
  expression (see animations). Small tentacles below.
- **Shell:** a logarithmic spiral cone, 3 to 5 whorls, sitting on the back. The shell has a
  base material, a team pattern, an optional decal, attachments (spikes, plates) and a damage layer.
- **Aperture:** the opening where the body emerges. Used as a pivot for the retreat animation.
- **Slime trail:** a thin translucent decal strip behind the snail.

## Team identity

Three independent channels so teams stay distinguishable for colour-blind players and at distance:

1. **Base colour:** 8 curated hues (picked in the lobby or auto-assigned). Palette is chosen for
   maximum separation under deuteranopia and protanopia; the in-game palette can swap to a
   high-contrast set.
2. **Pattern:** stripes (along the spiral), spots, bands, zigzag, or checker. Assigned
   per team, so two teams never share a pattern in a match.
3. **Decal:** a small emblem on the last whorl (leaf, star, skull, bolt, flower, moon...), drawn with softened corners as a darker rim plus a lighter inset fill so it reads as painted on.
   Across-growth patterns (ribs, zigzag, checker) stay clear of the apex (`APEX_CLEAR` 0.42, soft fade) so no spoke hub forms; the body uses a soft wrap ramp (no hard bands) and faint mottling.
   Players can choose one in the lobby.

A team name tag floats above the active snail only; other snails rely on shells.

## Upgrade tiers

Techs from the Shell branch change the material; other branches add attachments
([technology-research.md](technology-research.md)).

| Tier | Material | Look |
|---|---|---|
| 0 | Chalky | Matte, thin, translucent edges; visible growth lines. |
| 1 | Calcified | Thicker, ridged, slight sheen; seashell-pearl. |
| 2 | Iron | Dark metallic, rivet-like studs, brushed anisotropy. |
| 3 | Crystal | Faceted transparent amethyst or quartz; internal glow; refractive tint. |

Attachments: spikes (Spiked Whorl), plating strips (Iron Plating), a rope coil (Slime Rope), a
small antenna (Scouting Mist), glow veins (capstones). Attachments are separate meshes parented to
whorl anchor points, so they follow any procedural shell shape.

Material changes animate: a 0.8 s transition where the old material dissolves out along the spiral
from the apex outward, with particles.

## Health damage

Cracks reflect health ratio `h = health / maxHealth`:

| Threshold | State | Visual |
|---|---|---|
| 100% to 76% | Pristine | Clean shell; tiny scuffs after the first hit. |
| 75% to 51% | Scratched | Hairline cracks near the aperture. |
| 50% to 26% | Cracked | Deep cracks across two whorls; one chunk missing. |
| 25% to 1% | Critical | Large missing section exposes the body; smoke wisps; eyes look worried; slow wobbling crawl. |

Implementation:
- Crack decals are blended by thresholds with a smooth interpolation, so cracks "grow"
  after a hit rather than popping.
- **Chip fragments:** when a hit takes the snail across a threshold, 3 to 8 fragments in
  the shell's material and colour spawn as small debris that falls and fades in 4 s. Number scales
  with damage.
- **Critical state:** emissive "exposed flesh" tint under the broken section, intermittent smoke
  particle emitter, low-health heartbeat audio on the TV only for the active snail.
- Damage is cumulative state but cracks may heal visibly with the Regrowth tech.
- Max-health upgrades change the ratio: cracks never *increase* from gaining max HP.

## Death

- **Shell left behind:** the snail leaves an empty shell, the body gone ("slid away" with a
  quick puff). The shell becomes a physics prop and **gravestone**: team colour and decal intact,
  cracked.
- (Shell colliders are deferred: the render layer only shows the shell; no sim colliders yet.)
- Planned: empty shells block movement and projectiles (small static colliders in the sim) and can be
  destroyed like terrain. They are a mild strategic element (cover) and give the arena a visible
  history.
- Drowned snails leave a floating shell that drifts.
- Eliminated teams leave a flower at the position of the last shell (cosmetic).

## Animations

| Animation | Description |
|---|---|
| Crawl | Procedural squash and stretch: foot compresses in waves while the shell bobs. Speed matches movement speed; wave direction is from tail to head. |
| Idle | Breathing squash, eye stalks sway and look around, occasionally lick the eye. |
| Aim | Body turns toward the aim yaw, one stalk tilts up following pitch, shell faces away. |
| Fire | Quick recoil squash; stalk flinch; weapon prop (small leaf-sling, tube, etc.) animates. |
| Jump | Anticipation squash, stretch in air, landing wobble. |
| Retreat | Body and stalks pull into the shell over 0.35 s with a squelch; shell rotates to face the threat; aperture closes. Shell stays upright. |
| Hit reaction | Flinch; stalks pulled back; brief shell shake that sheds fragments. |
| Eye-stalk expressions | Neutral, focused (stalks forward and together), worried (droop), angry (angled inward), dizzy (spiral eyes), happy (high and apart), dead (X, then gone). |
| Victory dance | Winning snails rise on their tails, wiggle the shell, stalks cross; confetti of petals. Team shell glows. |

Expressions are driven by state: low health, recently damaged, wind, targeted by a missile
and so on. They are data-bound, not scripted per event.

## Procedural shell generation

Shells follow a logarithmic spiral, radius `r(θ) = a · e^(b·θ)`, swept along a growing circular
(or elliptical) cross-section. Parameters per snail are generated from the team seed so two
snails on the same team look related but not identical.

| Parameter | Range | Effect |
|---|---|---|
| `a` | 0.05 to 0.10 | Starting radius (apex size, blunts the tip). |
| `b` | 0.20 to 0.27 | Growth rate (scaled by 0.5 per radian; whorls grow 1.9x to 2.4x per turn). |
| `turns` | 2.8 to 3.5 | Number of whorls. |
| `tilt` | -4 to 4 degrees | Extra lean about the aperture axis. |
| `ellipse` | 1.0 to 1.2 | Cross-section aspect (coil-axis extent over in-plane extent). |
| `ridges` | 0 to 12 | Gentle growth swells along the spiral. |
| `bumpiness` | 0 to 1 | Tiny surface noise. |

**Geometry (M9-07).** The centre line is a conical logarithmic spiral (slope 0.22: a raised spire)
and the tube radius grows with it (`0.5 r + 0.55 a`). Consecutive whorls overlap, so their
intersection forms the **suture groove** without extra geometry; normals are smooth (the duplicated
seam column is welded) and the material is not flat-shaded. The last 12% of the tube flares into a
rounded **lip**, then the mouth rolls inward into a hollow interior (`aSpiral` 1). The coil axis
leans 26 degrees so a face shows from the front camera. LOD0 is 46 rings x 12 (about 1100
triangles), LOD1 20 x 6. `userData.decal` carries a flat seat on the last whorl (position + normal)
which the emblem decal follows.

**Patterns follow the spiral.** `lines` and `bands` run along the growth direction (functions of
`aAround`); `ribs`, `zigzag`, `checker`, `diagonal` run across it with fixed `aSpiral` frequency, so
they fan out as whorls widen, and are cleared from the apex (`APEX_CLEAR`) to avoid a spoke hub;
`spots` cells scale with the whorl. Every shell gets subtle growth lines, a darkened suture
(`sutureWeight`), a pale lip, a dark mouth and a soft satin highlight (high tiers).

A snail's shell must keep its collision proxy fixed so gameplay is never affected. Generation uses
`seed = hash(teamId, snailIndex)`; mesh is built once on spawn (about 3000 triangles) and cached.
Upgrades add geometry (spikes) rather than regenerate the base.

Readability review of tiers and cracks: [readability-review.md](development/readability-review.md).

## Terrain tilt (M10-01)

Snails follow the ground: a `tiltGroup` above the yaw group rotates local up onto the terrain
normal (pitch and roll), while yaw stays `facing`. The normal is the average of the SDF gradient
at the foot and four points 0.3 m around it, read from the live (carved) grid, so craters count.
Tilt is clamped to 50 degrees and damped (rate 9/s, frame-rate independent); airborne and dead
snails ease back upright. The foot position is the pivot, so nothing floats. Labels stay upright.
Maths in `packages/render/src/snail/terrain-tilt.ts`. Render only: physics is unchanged.

## Technical notes

- **Shader uniforms/instances:** `uDamage` (0 to 1, `1 - h`), `uTeamColor` (vec3), `uPatternId`
  (int), `uPatternScale`, `uMaterialTier` (0 to 3), `uGlow` (0 to 1), `uResearchPulse` (0 to 1),
  `uSeed`. Per-snail values are passed as instanced attributes, so many snails share one draw call.
- **Textures:** a shell **texture atlas** holds pattern masks (single channel), crack masks (3
  levels in RGB channels), decal icons, and a tileable material normal/roughness set per tier.
  Atlas pages 2048 x 2048, BC7/ASTC-compressed, with mipmaps.
- **Pattern rendering:** patterns are sampled in shell UV (θ along the spiral, φ around the
  cross-section) so they wrap cleanly; no baked per-team textures.
- **Cracks:** `crackMask = mix(c1, c2, smoothstep(0.25, 0.5, uDamage)) ...` with a world-space
  noise warp; cracks darken albedo, add normal depth and let emissive light through at critical.
- **LODs:** LOD0 (3k tris, full shader) under 10 m from the camera; LOD1 (900 tris,
  no attachments, baked normal) to 30 m; LOD2 (250 tris, flat-shaded impostor with team colour
  only) beyond. Spikes and fragments cull first.
- **Budget:** up to 16 snails at LOD0/1 each under 0.4 ms GPU on a mid-range integrated GPU
  (target hardware in [graphics.md](graphics.md)).
- **Quality tiers:** Low disables refraction (crystal is a tinted opaque) and fragment spawn.
- **Data binding:** the display maps `SnailState` and tech `visual` payloads to the above through
  a single `ShellAppearance` function so mods can add materials (see
  [extensibility.md](extensibility.md)).

## Art direction

- **Style:** stylised low poly with soft toon lighting
  ([ADR-0009](adr/0009-stylised-low-poly-art-direction.md)); chunky silhouettes, soft rounded
  shapes, exaggerated proportions (shell about 60% of snail height). Colour comes from a fixed
  palette and lighting, not painted textures. Exact values live in `art-direction.md` (MG-01).
- **World scale:** a garden seen as a miniature. Soil banks, flowerpot shards, bottle caps,
  leaves as bridges, pebbles as boulders, grass blades as trees, dew puddles as water.
- **Palette:** warm afternoon light with long soft shadows; saturated shells against muted
  earth tones so they pop; water is cool teal to contrast.
- **Readability:** silhouettes distinct at TV distance; team colour never shared with the
  terrain's dominant hues; projectile trails use high-contrast.
- **VFX:** petals, dust, sparks of salt crystals, slime strings, steam; avoid heavy fullscreen
  effects that obscure aiming.
- **Audio hooks:** squelch, shell tap (pitch by material), crack on threshold, glassy chime
  for crystal.
- **Tone:** cute but never gross. Death is a shell left behind.
