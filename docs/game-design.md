# Snails: Game Design

Numbers here are starting values for playtesting. All of them live in content data, not code
(see [extensibility.md](extensibility.md)).

## Match overview

Teams take turns in a fixed rotation. Within a team, snails rotate so each snail acts once before
any snail acts twice. A match ends when its mode's win condition is met.

## Turn structure

| Phase | Default | Notes |
|---|---|---|
| Intro | 2 s | Camera frames the active snail; wind is shown. |
| Action | 30 s | Move, jump, aim, switch weapon, use utility. Timer shown on TV and phone. |
| Fire | instant | Firing ends the free-action period (except for multi-shot weapons). |
| Resolve | variable | Projectiles fly, terrain collapses, damage applies, effects settle. No input. |
| Retreat | 5 s | Active snail may crawl or retreat into its shell; others frozen. Tech can extend. |
| Settle | until still | Wait for all snails and debris to rest; then deaths, drowning and crate drops resolve. |

Rules:
- The action timer pauses during Resolve; it starts counting down on the first input in a turn
  only if "lazy start" is enabled (off by default).
- A snail that fires with no timer left gets only the Retreat window.
- Ending the turn early from the phone skips directly to Retreat if a shot was fired, otherwise to
  Settle.
- Skipping all turns three times in a row marks a human as idle and offers a CPU takeover.

## Snail movement

Snails are slow and committed.

- **Crawl:** 1.2 m/s on flat ground (a snail is about 0.5 m long; a map is roughly 60 to 100 m wide).
  Crawl leaves a visible **slime trail** that fades over about 20 s.
- **Slime trail:** Cosmetic and mechanical. Allies move 25% faster along fresh trail; enemies are
  unaffected. Trails are one of the tools for pathing and for the AI to read recent movement.
- **Climbing:** Snails can climb slopes up to 70 degrees (other critters give up at 45). Above 70
  degrees is a wall. Climbing speed scales down with slope. Overhangs are not climbable.
- **Jump:** A "flop-hop": fixed forward arc of 2.5 m, 1 m high. Costs 1 jump charge; 2 jumps per
  turn base.
- **Backflip:** Higher, shorter arc (1.2 m forward-reversed, 2.5 m high), 1 charge, longer recovery.
- **Move budget:** 8 s of crawling per turn (separate from the 30 s timer, so crawling is the real
  cost). Mobility techs extend this.
- **Shell retreat (defensive stance):** Instead of acting further, a snail can draw into its shell.
  While retreated: takes 40% less direct and 60% less blast damage, cannot be knocked into
  the air as far, but cannot act on its next turn start for 2 s. Shell integrity matters:
  cracked shells reduce the benefit (see [snail-visuals.md](snail-visuals.md)). Pulling into the
  shell is also the safe way to end a turn after firing.

## Health, falling and drowning

- **Health:** 100 base. Shell Armour techs add up to +60.
- **Fall damage:** Free falls up to 3 m are harmless. Beyond that: 4 damage per extra metre, cap 40.
  Landing in soft soil (dug terrain, leaf piles) halves it. Retreated snails take 50%.
- **Drowning:** Puddles are instant death for snails that enter below the surface, unless they
  have Bubble Shell or are on a lily pad / floating prop. Water rises in sudden death.
- **Out of bounds:** Leaving the map edge or falling below the world floor is instant death.
- **Knockback:** Explosions push snails away. Knockback is scaled by weapon and reduced by the
  Heavy Shell techs.

## Terrain and destruction

The world is a 3D voxel signed distance field (see ADR-0005). Weapons carve spheres or other
shapes; some add material.

- **Material types:** every solid cell carries a material (a compact `Uint8Array` beside the
  SDF, `SdfGrid.materials`; index into `materialTable`, defined in `terrain/materials.ts`).
  Carving is resistance-scaled per cell: the carve radius in a cell is `radius * (1 - carveResistance)`,
  so a crater is shaped by every layer it cuts and stops at rock. Base materials: Soil (0,
  diggable), Sand (-0.2, carves slightly more, soft landing), Clay (0.5, half radius), Stone (0.8,
  and indestructible by carves whose damage power is below 30, so weak weapons leave it untouched).
  Resistance may go down to -0.5. Not yet implemented: Roots and Leaf litter.
- **Material layout:** the generator lays strata deterministically from the map seed: sand on
  beaches, a metre of soil on top, wobbly clay layers below, rock boulders and bedrock at depth.
  Clients regenerate the grid from the seed (as for the SDF), so the material layer needs no wire
  payload; carves and collapses never change materials. The `terrainCarved` event carries the
  carve's damage `power` so the render replica applies the identical per-cell rule. The renderer
  tints sand, clay and rock by material (per-vertex colour from the nearest cell).
- **Collapse:** Unsupported soil fragments fall. Small chunks become debris that deals 5 to 10
  damage; large chunks bury snails (trapped, they must dig out using a tool or wait).
  (Core currently drops each floating cluster rigidly onto its support and lifts snails out of it;
  unsupported clusters are removed. Debris damage and burial are not yet implemented.)
- **Maps:** Hand-authored seeds plus procedural generation. Maps are 3D but playable as a mostly
  side-on 2.5D view; vertical depth matters through tunnels and burrows.
- **Camera:** Display-side concern; follows action, never decides rules.

## Wind

- Wind is a 2D vector, redrawn every turn, shown as an arrow and leaf particles.
- Range 0 to 10 units; 10 shifts a standard shell about 12 m over a 40 m shot.
- Wind affects all projectiles except Hitscan and Beam types. Light weapons (spores, bubbles)
  take 2x.
- Setting: Off, Low (0 to 3), Normal, Storm (changes mid-flight).
- The Weather Vane tech (Utility branch) previews next turn's wind.

## Weapon categories

| Category | Behaviour | Example |
|---|---|---|
| Projectile | Ballistic arc with gravity and wind | Salt Shaker |
| Thrown | Short arc, fused or contact | Slime Grenade |
| Bouncing | Bounces off terrain, fused | Pebble Roller |
| Guided | Steerable or homing after launch | Radula Missile |
| Area | Placed or dropped, lingers | Spore Cloud |
| Digger | Tools that carve, not damage | Shell Drill |
| Melee | Short range, high knockback | Shell Bash |
| Utility | No damage; repositions or protects | Slime Rope |

Ammo: base weapons have infinite uses; special weapons come in limited stock, granted by research
unlocks, crates and match settings.

## Initial weapon list (base content pack)

| # | Name | Category | Behaviour | Damage | Notes |
|---|---|---|---|---|---|
| 1 | Pebble Toss | Projectile | Plain stone lobbed with power control. | 15 core, r=1.5 m | Infinite ammo; the default. |
| 2 | Salt Shaker | Projectile | Cluster of 5 salt grains, spread by power. Salt is the snail's nemesis. | 8 each, r=1 m | Salt does an extra 4 damage per turn to the target for 2 turns (burn-like). |
| 3 | Slime Grenade | Thrown | 3 s fuse; bursts into sticky goo. | 25, r=3 m | Goo slows snails in radius by 50% for 1 turn. |
| 4 | Pebble Roller | Bouncing | Heavy round stone; rolls downhill and bounces; 4 s fuse. | 30, r=2.5 m | Great on slopes; terrain-dependent. Terrain never detonates it (bounce motion); only the fuse or a snail does. |
| 5 | Radula Missile | Guided | Launches; player steers left/right with the joystick for 4 s. | 35, r=2.5 m | Short guidance window; wind has a strong effect. |
| 6 | Spore Cloud | Area | Mushroom spore canister. Cloud lingers 3 turns. | 6 per turn start, r=4 m | Ignores shell retreat. Blown by wind. |
| 7 | Shell Drill | Digger | Spinning drill tunnels 8 m in the aimed direction. | 0 (10 if it hits a snail) | Escape and flank tool. Tube 1.6 m wide; rock stops it (carve power 20 < rock 30). |
| 8 | Shell Bash | Melee | Headbutt with the shell at point blank. | 20 + heavy knockback | Knocks enemies into puddles. Needs the shell upgraded or intact. |
| 9 | Slime Rope | Utility | Fires a sticky strand; swing or climb. | 0 | Replaces jumping; 1 per turn. |
| 10 | Dew Bomb | Area | Water balloon; leaves a temporary puddle for 3 turns. | 5, r=3 m | Floods low pits; extinguishes salt; can drown enemies. |
| 11 | Beetle Barrage | Special | Calls in 6 delayed shells across a line. | 18 each | Unlocked by research (Weaponry III). Telegraphed to avoid cheap kills. |
| 12 | Snail Mail | Utility | Teleport your snail to a marked spot after a 1 turn delay. | 0 | Utility branch unlock; telegraphed arrival point. |

## Crates and pickups

- Crates parachute in (as a leaf) every 3 rounds by default; up to 2 on the map.
- **Types:** Supply (random weapon stock), Calcium (research resource, see
  [technology-research.md](technology-research.md)), Health (heal 25), Utility (one-use tool such as
  Slime Rope), and rarely a Mystery crate (random good-or-bad effect).
- Crates are picked up by crawling over them. Design intent: opening takes a free turn action
  that damage can interrupt; currently (M4-14) pickup is immediate on contact. See
  [extensibility.md](extensibility.md#crates-and-pickups) for the drop rules as built.
- Shooting a crate destroys it; crates can be nudged by explosions and drift downhill.
- Rare **Golden Crates** carry a research jump (instant tier advance) and are announced by the
  display with a sound cue. They are placed away from the leader.

## Win conditions

- **Last team standing** (Classic).
- **First to research goal** (Research race).
- **Hold the zone** (King of the Hill).
- **Sudden death:** After round 20 (configurable), water rises 1 m per round and max health
  of every snail falls to 1 over 5 rounds. Ensures every match ends.
- **Draw:** If the last snails die simultaneously, the team that dealt the most damage that turn
  wins; otherwise a draw is declared.

## Game modes

### Classic
Eliminate the opposing teams. Default match length 20 to 30 min. All techs available.

### Research race
The goal is to finish a target tech (the "Great Spiral", a 4th-tier capstone available in every
branch; picking one locks others) before opponents. Combat still matters: damage dealt and
crates give Calcium, and kills do not end the game unless a team is eliminated. Good for
shorter matches with pacifist-leaning groups.

### King of the Hill
A glowing "Dewdrop Zone" appears and relocates every 3 rounds. A team scores 1 point per snail in
the zone at the end of its turn, 3 for holding it alone. First to 30 wins. Eliminated teams
respawn after 2 rounds as a shell-less "hatchling" with 20 health. Encourages aggression and
makes mobility techs valuable.

Modes are content definitions; custom modes are possible via the event bus.

## Match settings

| Setting | Options (default bold) |
|---|---|
| Teams / snails each | 2 to 4 teams, 1 to 4 snails (**3**) |
| Turn time | 15 / **30** / 45 / 60 s |
| Starting health | 50 / **100** / 150 |
| Wind | Off / Low / **Normal** / Storm |
| Map | Preset list or Random seed; size S / **M** / L |
| Crates | Off / Rare / **Normal** / Frequent |
| Research | Off (classic weapons only) / **On** / Fast |
| Sudden death | Off / **Round 20** / Round 12 |
| Fall damage | Off / **On** / High |
| Friendly fire | **On** / Off |
| Team colours | Auto or picked in the lobby |

Presets: *Quick* (2 snails each, fast research, round 12 sudden death), *Standard*, *Epic*
(4 snails, slow research, large map).

## Local multiplayer modes

- **One phone per player (recommended):** each human has a phone, controls their team's active
  snail only on their turn. Research screens are private.
- **Hot-seat (shared phone):** one phone controls multiple teams. The phone shows a "Pass to
  <team>" interstitial between turns; private research screens are hidden behind a hold-to-reveal
  button. Works with as little as one phone.
- **Mixed:** any combination, plus CPU teams ([ai.md](ai.md)).
- **Spectators:** extra phones may join as spectators with no controls.
- **Host-only fallback:** if no phone is available, the host keyboard or a gamepad can control one
  team (dev and demo aid).
