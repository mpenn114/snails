# Art direction

Source of truth for how Snails looks ([ADR-0009](adr/0009-stylised-low-poly-art-direction.md)). All
values here are mirrored in `packages/render/src/style/palette.ts`; change both together. Colour
hex values below are sRGB.

**One line:** stylised low poly with soft toon lighting; a miniature garden seen at snail scale in
warm late-afternoon sun with long soft shadows; cute and comic, never gross.

## 1. Palette

Terrain is muted and earthy; shells and UI accents are the saturated things on screen.

| Role | Name | Hex |
| --- | --- | --- |
| Sky | `skyTop` | `#7fb4e6` |
| Sky | `skyHorizon` | `#ffe2b8` |
| Haze (fog) | `haze` | `#f6d9b4` |
| Sun light | `sunLight` | `#ffd9a0` |
| Fill | `hemiSky` | `#bcd8f0` |
| Fill | `hemiGround` | `#6b5a3c` |
| Grass top | `grassTop` | `#86b04a` |
| Grass edge (dark rim, undersides) | `grassEdge` | `#5c8a34` |
| Soil | `soil` | `#946a48` |
| Deep soil | `deepSoil` | `#5e4230` |
| Rock | `rock` | `#9a968c` |
| Scorch (craters, burn) | `scorch` | `#2e2622` |
| Water shallow | `waterShallow` | `#62c7c9` |
| Water deep | `waterDeep` | `#2a7f9e` |
| Water foam | `waterFoam` | `#f4fbf6` |
| Snail body skin | `snailSkin` | `#f0c9a0` |
| UI ink | `uiInk` | `#2b2438` |
| UI paper | `uiPaper` | `#fff6e4` |
| UI accent | `uiAccent` | `#ff8a3d` |

### Team shell colours (slot 0 to 7)

| Slot | Name | Hex |
| --- | --- | --- |
| 0 | cherry | `#e5283f` |
| 1 | cobalt | `#1a46c8` |
| 2 | sunflower | `#ffd21f` |
| 3 | violet | `#b07cff` |
| 4 | bubblegum | `#ff6fb8` |
| 5 | cyan | `#12d0e6` |
| 6 | tangerine | `#ff7a14` |
| 7 | pearl | `#f6f4fa` |

Chosen to differ in lightness as well as hue, so protanopia and deuteranopia still separate them
(pairwise CIE76 delta E over 20 normally, over 10 under simulated protan/deutan; at least 25 from
every terrain colour). The unit test enforces this. No team is green or brown; terrain owns those.
Pattern and decal channels in [snail-visuals.md](snail-visuals.md) remain the second cue.

## 2. Lighting

| Parameter | Value |
| --- | --- |
| Sun colour / intensity | `#ffd9a0` / 2.4 |
| Sun elevation / azimuth | 32 degrees above horizon / 235 degrees (clockwise from +Z towards +X), so shadows fall long to the north-east |
| Hemisphere sky / ground / intensity | `#bcd8f0` / `#6b5a3c` / 1.1 |
| Tone mapping | AgX (`THREE.AgXToneMapping`), exposure 1.0 |
| Fog (haze) colour | `#f6d9b4`, linear, start 0.45 and end 1.0 of camera far |

Shadow softness (PCF radius in texels, map size): High 3 / 2048, Medium 2 / 1024, Low 1 / 512,
Mobile none (use a cheap blob shadow decal under each snail). Shadows are tinted by the hemisphere
fill, never black: darkest lit band stays at 58% brightness.

## 3. Shading rules

- Toon look: 3 bands (lit above 0.65 of N.L, mid above 0.30, shade below) at brightness 1.0, 0.78,
  0.58. Soften the band edges slightly (about 0.05 smoothstep) so they do not alias.
- Flat facets are welcome; do not smooth-shade away low-poly character on props. Terrain uses
  smoothed normals quantised through the toon ramp.
- Low roughness (0.25 to 0.4) only for shells and water. Everything else is matte (roughness 1).
- Terrain only: three CC0 tileable textures (grass, dirt, rock; `packages/content-base/assets/textures/`)
  sampled triplanar in world space. They are neutralised to mean grey, so the palette above
  supplies the hue and the texture only adds low-contrast detail. Grass on up-facing surfaces
  with a soft noisy edge, dirt on slopes and below the cap, rock on steep walls and deep down.
  Terrain uses smooth normals with a softened toon ramp. Phones: one projected sample per
  layer, 512 px, no normal maps. Everything else stays untextured (procedural or flat colour).
- Post (TV display only): High tier runs N8AO ambient occlusion, mild bloom, a slight warm grade
  (1.04 / 1.0 / 0.93), a light vignette, AgX tone mapping and SMAA through the pmndrs
  `postprocessing` composer; Medium runs AgX + SMAA; Low and phones render straight to the canvas.
- Outline: optional, High tier on the display only (inverted-hull or post pass), 2 px, `uiInk`
  at 70% opacity. Never on phones.
- Rim light on shells (fresnel, `sunLight`, 25% strength) helps silhouettes at TV distance.

## 4. Shape language

- Chunky, rounded, exaggerated. Big heads/shells, short limbs, thick stalks, fat mushroom caps.
- Shell is about 60% of snail height ([snail-visuals.md](snail-visuals.md) `SHELL_HEIGHT_FRACTION`).
- Round every silhouette corner: bevel or radius of at least 8% of the object's smallest
  dimension. No sharp thin spikes except cosmetic weapon upgrades, and keep those chunky.
- Triangle budgets (LOD0, per instance): snail 1500 (shell 700 of that), prop 200, projectile 120,
  particle sprite or mesh 40. Reuse via instancing for props and debris.
- Scale reference: snail is about 0.5 m long; clover leaf about 0.35 m; mushroom 0.4 to 1.2 m;
  pebble 0.15 to 0.6 m; leaf 0.8 m. Garden objects are larger than life to read at TV distance.

## 5. Per-element guidance

**Terrain.** Grass cap: thin (about 0.25 m) `grassTop` layer on surfaces whose normal faces up
(normal.y above 0.6), blending to `grassEdge` over the last 0.1 m of the rim. Below the cap, soil
strata alternate `soil` and `deepSoil` in horizontal bands about 1 m thick with wobbly (low
frequency noise) boundaries; rock patches (`rock`) appear in deeper strata and on steep walls
(normal.y below 0.3). Craters expose whatever strata they cut and get a 0.3 m `scorch` ring that
fades over 10 s of play to 40% strength (not fully, so history remains).

**Props.** Instanced, purely cosmetic, never block aim or collision. Mushrooms (red cap with
cream dots, tan cap, white stalk), pebbles (`rock` with 10% value jitter), clover (three round
leaves, `grassEdge`), leaves (curled, autumn tints from `uiAccent`, `soil`), grass tufts (3 tris
blades). Keep props at least 1 m from spawn points and off steep walls. Spawn deterministic from
the map seed; cosmetic RNG only.

**Snails.** Body `snailSkin` with a warm lighter belly; big round eyes on stalks with white
sclera and `uiInk` pupils; tiny blush. Shell in the team colour with a lighter spiral ridge. Idle
bob and blink, squash and stretch on move and fire. Damage cracks stay cartoon (zig-zag lines),
no gore; defeated snails pop out of the shell with a puff and a gravestone flower.

**Water.** `waterShallow` near edges to `waterDeep` by depth, soft specular, 2 to 3 band toon
foam line in `waterFoam` where it meets terrain, gentle vertex waves. Flat tinted plane on Low
and Mobile.

**Explosions.** Puffy smoke made of 5 to 9 overlapping round low-poly balls that grow, brighten
to `sunLight` then fade to `scorch` at 60% opacity over 1.2 s; a short bright flash ball in
`uiAccent`; chunky debris (6 to 14 cubes and wedges in soil/grass colours, 0.1 to 0.3 m) with
a ballistic arc and bounce. No realistic fire.

**Projectile and aim arc.** Projectiles are chunky shapes (about 0.25 m) in a bright colour that
contrasts with both grass and sky: use `uiAccent` body with a `uiPaper` highlight; the trail is a
tapering ribbon or puff chain in `uiPaper` (80% to 0%) so it reads on green and on soil. The aim
arc is dashed `uiPaper` dots with an `uiInk` 1 px edge, brightening towards the target; it uses
the active team colour only for the endpoint ring.

**HUD.** Rounded cards on `uiPaper` at 92% opacity with `uiInk` text and 2 px `uiInk` outline,
corner radius 12 px, soft drop shadow. Type scale in px: 12, 14, 18, 24, 32, 48 (display scales
by viewport; phone body text never below 14). `uiAccent` only for the single primary action or
highlight per screen. Team colour appears as a chip or bar, never as a text colour on `uiPaper`
(yellow/white fail contrast).

## 6. Do and don't

Do:
- Use the palette constants; derive tints by mixing palette colours, not new hexes.
- Keep silhouettes readable at TV distance: snail, projectile and aim arc must pop from terrain.
- Keep terrain low-contrast and muted so units read first.
- Give every effect a clear start, peak and fade; short and punchy.

Don't:
- Share a team colour with terrain (no green or brown shells; no `uiAccent` team).
- Use black outlines or pure black/white anywhere (darkest is `scorch`/`uiInk`, brightest
  `uiPaper`/`waterFoam`/pearl).
- Add image textures, realistic blood or gore, thin spikes or sharp slivers.
- Let cosmetics (props, particles) affect simulation or the protocol.
- Use bloom so strong that it hides the aim arc or shell colours.

Readability rules: team colour is the most saturated element near a snail; the projectile trail
must differ by at least delta E 25 from both `grassTop` and `skyTop`; the active snail gets a
bouncing marker in its team colour plus a `uiPaper` rim.

## 7. Mobile tier notes

On the `mobile` tier: no shadow maps (blob shadow decals), no outline, no bloom or post, flat water
plane, hemisphere plus one directional light only, toon bands computed in the material (no extra
pass), fog kept (cheap), shell reflection replaced by rim term, particle counts at 40% (see
`quality.ts`), props at 30% density and no grass tufts, snail LOD1 (about 600 triangles) beyond
15 m. Triangle budgets above are halved for prop and particle classes. Colours and shapes stay
identical so the phone and TV look like the same game.
