# Extensibility

Content is data plus a small set of named behaviours ([ADR-0006](adr/0006-data-driven-extensibility.md)). The base game is the content pack `@snails/content-base`; mods use the same API. Sections marked "Planned" are design intent that is not built yet; everything else is real and lives in `packages/core/src/content/` (`@snails/core`).

## Schemas and registries

Each definition kind has a zod schema in `packages/core/src/content/schemas.ts`; the TS type is `z.infer` of it (`WeaponDefinition`, `CrateDefinition`, `WindDefinition`, `StatusDefinition`, `AreaDefinition`, `TechnologyDefinition`, `ShellUpgradeDefinition`, `ContentPackManifest`). Schemas are `.strict()`: unknown fields are errors.

`ContentRegistry<T>(kind, schema)` stores definitions by id. `register(item, packId)` validates and throws a `ContentError` (`INVALID_DEFINITION`, `DUPLICATE_ID`, `FROZEN`) naming the pack, kind and id. `list()` is sorted by id, so output never depends on registration order. `createContentRegistries()` returns the full set: `weapons`, `technologies`, `shellUpgrades`, `crates`, `winds`, `statuses`, `areas`. To add a content kind (terrain `materials` does this): one field in `ContentRegistries`, one line in `createContentRegistries`, one optional list in `ContentPack` (same field name), and optionally a cross-reference check in `pack-validation.ts`.

Ids are `pack:kebab-name` (`base:salt-shaker`). Technology and shell upgrade ids are still unqualified.

### Weapon

```ts
export const saltShaker = {
  id: 'base:salt-shaker',
  name: 'Salt Shaker',
  category: 'projectile', // projectile | thrown | bouncing | guided | area | digger | melee | utility | special
  launch: { minSpeed: 4, maxSpeed: 22, gravityScale: 1, windScale: 1.5, projectileRadius: 0.1 },
  fuseSeconds: 0, // 0 = detonate on impact
  pattern: { count: 5, spread: 0.3, spreadByPower: true }, // optional cluster
  motion: { kind: 'ballistic' }, // optional; ballistic is the default
  effects: [
    // run, in order, when the weapon (or each grain) detonates
    { type: 'carve', radius: 0.8 },
    { type: 'damage', radius: 1, maxDamage: 8, knockback: 2, falloff: 'linear' },
    { type: 'status', statusId: 'base:salt', radius: 1, turns: 2 },
  ],
  ammo: 'infinite', // or a number
  // requiresTech: 'some-tech'  (cross-checked at load)
  // perTurn: 2                 (uses per turn, default 1)
} satisfies WeaponDefinition;
```

There is no weapon-specific code in the sim: `fire` spawns `pattern.count` projectiles (a deterministic fan, no RNG), the projectile system steps them with the motion strategy, and a detonation runs `effects` through the effect handler table.

### Effects (the whole vocabulary)

A small union discriminated on `type` (`content/effects/effect-schemas.ts`). Each type has exactly one handler in `effectHandlers` (`content/effects/handlers.ts`), called as `handler(ctx, effect, at, source)`: `ctx` is a `SimContext` plus the match content (`EffectContext`), `at` the detonation point, `source` is `{ weaponId, ownerSnailId }`. `runEffects(ctx, effects, at, source)` runs a list.

| type     | fields                                                                                                                         | does                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `damage` | `radius`, `maxDamage`, `knockback?`, `falloff?`                                                                                | emits `explosion`, hurts and pushes living snails in range    |
| `carve`  | `radius`, `collapse?`                                                                                                          | removes terrain, emits `terrainCarved` (and `terrainCollapsed`) |
| `status` | `statusId`, `radius`, `turns?`, `magnitude?`                                                                                   | applies a status to snails in range                           |
| `spawn`  | `spawn: { what: 'area', areaId, radius?, turns? }` or `{ what: 'projectiles', weaponId, count, speed, spread? }` | creates an area, or sub-projectiles of another weapon         |
| `move`   | `mode: 'teleport'`, `lift?`                                                                                                    | moves the firer to the detonation point, emits `snailMoved`   |
| `reel`   | `seconds`, `standoff`                                                                                                          | if the detonation point touches terrain, reels the firer along a strand to `standoff` m off the surface (`rope/rope-system.ts`), emits `ropeAttached`/`ropeReleased`; fizzles in open air |
| `schedule` | `turns`, `effects` (any of the above except `schedule`), `telegraph: { radius, style? }`, `line?: { count, length }` | queues the effects to run at the detonation point after `turns` turn starts (see Scheduled effects) |

To add an effect type: add its schema to `EffectSchema`, add one entry to `effectHandlers` (the table type forces you to), and add a protocol event if clients must see it.

### Melee delivery, per-turn limits and utilities

Three optional weapon fields cover melee and utility weapons without any weapon-specific code:

- `melee: { reach }` replaces the projectile: `fire` emits `meleeStruck` and runs `effects` at a point `reach` metres in front of the firer along its facing (horizontal; the aim angle is not used and power is irrelevant). Effects skip the firer (`EffectSource.excludeOwner`). A `damage` effect with `announce: false` skips the `explosion` event, so there is no blast visual or scorch (`base:shell-bash`: 20 damage, 12 m/s knockback, radius 1.2 at reach 1).
- `perTurn: n` limits uses per turn (`turn.uses`, reset each turn). It is enforced by `validateCommand` (`NO_USES_LEFT`, when the weapon registry offers `get`) and again in the `fire` handler. Weapons without `perTurn` (or `endsAction: false`) are not limited.
- `endsAction: false` means firing does not end the action phase (no `notifyFired`): the snail can still aim and fire a real weapon afterwards.

`base:slime-rope` combines them: a 40 m/s straight projectile with a 0.3 s fuse (about 12 m), effect `reel`, `perTurn: 1`, `endsAction: false`. The `reel` effect checks that the detonation point is within 0.35 m of terrain (a strand that ends in open air or on a snail does nothing), sets `snail.rope` (anchor, from, to, seconds, elapsed) and the `rope` system (registered by `registerCombat`, after movement) eases the snail along the straight line to `anchor + normal * standoff`, zeroing velocity and the fall height so the reel causes no fall damage. A step into terrain ends the reel early. At the end `ropeReleased` fires and normal falling takes over (so aiming at a wall behind a ledge drops the snail onto the ledge). Clients draw the strand (`render/src/effects/strand-effects.ts`, from `ropeAttached`/`ropeReleased` plus the snapshot) and a puff on `meleeStruck`; `aimPreview` carries `melee: { reach }` so displays show a strike marker instead of an arc, and the controller's fire button reads "Bash"/"Use" for melee/utility weapons.

### Motion strategies

`physics/motion.ts` holds `MotionSchema` (discriminated on `kind`) and the `motionStrategies` table. The projectile system calls `stepMotion(p, wind, dt)`, which looks up `p.motion?.kind ?? 'ballistic'`. To add a motion: add its schema to the `MotionSchema` union and one `motionStrategies` entry. A strategy (`MotionStrategy`, `physics/motion-types.ts`) has a pure `step(p, motion, wind, dt)` (free flight; aim previews call it too) and optional hooks the projectile system calls generically: `prepare` (before contacts; may mutate terrain), `onTerrainContact` (returns `detonate`, `expire` (silent end) or `continue` with a new position and velocity; absent means detonate; snail contacts always detonate), `finished` (silent end, e.g. drill length) and `previewRange` (metres, caps the aim preview). Shared projectile code does not change.

- `ballistic` (default): gravity and wind arc.
- `guided` `{ steerRate, guidanceSeconds }`: see below.
- `bounce` `{ restitution, friction, rollDrag? }` (`motion-bounce.ts`): terrain contact reflects the velocity along the SDF normal (`restitution` keeps that share of the normal speed, `friction` removes that share of the tangential speed). A contact slower than `REST_SPEED` (1.6 m/s) rolls instead: the normal component is dropped, gravity then accelerates the stone down the slope, and `rollDrag` (1/s, default 0.35) slows it. Terrain never detonates it; the fuse or a snail does (Pebble Roller).
- `drill` `{ length, tubeRadius, power }` (`motion-drill.ts`): constant-speed straight flight, gravity and wind ignored. Every step carves a sphere of `tubeRadius` (so a tube of that radius) at carve `power` and emits `terrainCarved`. Distance is `age * speed`; at `length` metres it ends silently. Terrain left standing after the carve ends it silently too: with `power` 20 below rock's `indestructibleBelowDamage` (30) rock stops the drill, and clay (resistance 0.5) is still cut because the tube is wide. Only a snail contact detonates (Shell Drill: flat 10 damage via the `flat` falloff, then stop).

`predictTrajectory(..., samples, stepsPerSample, motion?)` uses the strategy's `step` and `previewRange`, so a drill previews as a straight line cut off at its length and a roller as its first free arc. The server relays `motion` in `aimPreview`.

**Guided motion and steering.** While `age < guidanceSeconds`, a guided projectile turns its velocity in the screen (XY) plane at `steerRate * steer` rad/s, where `steer` (-1..1, positive = clockwise side-on, i.e. "turn right") is stored on the projectile by the `steer` command (`{ type: 'steer', snailId, input }`). The command is validated like the others (active snail and team, finite input within -1..1) and allowed in the `fire` and `resolve` phases; it affects only the snail's own projectiles still inside their guidance window, so it is deterministic and replayable. After the window the projectile flies ballistically. On the wire the controller sends `{ type: 'steer', input }` (throttled to about 20 Hz, a final `0` on release); the server accepts it in the fire/resolve phases. The controller switches its joystick from move to steer while a guided projectile is in the snapshot. `base:radula-missile` is the reference weapon (`weapons/radula-missile.ts`); the renderer draws weapons listed in `MISSILE_WEAPON_IDS` as a missile oriented along its velocity.

### Statuses

`StatusDefinition`: `id`, `name`, `perTurnDamage?`, `moveSpeedMultiplier?`, `defaultTurns?`, `cures?`. They live on the snail as `Snail.statuses: StatusInstance[]` (`id`, `turnsLeft`, `magnitude`, `sourceSnailId`). Rules (`status/status-system.ts`):

- Applied by the `status` effect (or an area) through `applyStatus`, which emits `statusApplied`. Re-applying the same status refreshes it (longest duration, largest magnitude) and never stacks. `cures` removes other statuses first.
- Processed at the **start of each turn of the afflicted snail's team**: damage `round(perTurnDamage * magnitude)` (cause `status`), then `turnsLeft -= 1`; at 0 the status is removed with `statusExpired`. A status of N turns ticks N times. If the active snail dies, its turn is skipped.
- `moveSpeedMultiplier` is exposed through `statusMoveSpeedMultiplier(snail, registry)` and consumed by `movementSystem(config, statuses)` (`createMatch` passes the registry): it scales the crawl speed only, not jumps. Because a status ticks down at the start of its team's turns, `turns: 2` slows a snail for exactly one full turn of its own (`base:goo`).

### Areas

`AreaDefinition`: `id`, `name`, `defaultRadius`, `defaultTurns`, `perTurnDamage?`, `applyStatus?`, `windDrift?`, `drowns?`, `waterDepth?`, `extinguishes?`. Instances live in `GameState.areas` (`id`, `kind`, `position`, `radius`, `turnsLeft`, `sourceSnailId`, `params?`), created by a `spawn` effect (`spawnArea`, event `areaCreated`). At **every turn start** (`area/area-system.ts`), in creation order: drift downwind by `windDrift` metres per unit of wind strength (`areaMoved`), affect every living snail inside (damage with cause `area`, a status, or drowning), then `turnsLeft -= 1` and remove at 0 (`areaExpired`).

**Water areas** (`waterDepth` set, `area/water-area.ts`; base: `base:puddle`). `spawnArea` settles the centre to the lowest terrain within the radius (`findLowPoint`: the centre plus two rings of 8 probe columns, ties keep the centre) and puts the surface `waterDepth` metres above it; the instance's `position.y` IS the surface height, so clients need no extra field. A snail touches the water when it is within `radius + 0.5` horizontally and its feet are below the surface: it loses the statuses in `extinguishes`. With `drowns`, a snail within `radius` whose centre is below the surface drowns (`snailDrowned`, `snailDied` cause `drown`, the same events as the sea). This runs when the area spawns, every simulation step (`water-areas` system, registered by `registerLingeringEffects`) and at turn start. Note: a snail resting on ground has its centre 0.5 m up, so the 0.9 m puddle drowns snails on flat ground too, not only in pits.

Views: `packages/render/src/effects/area-views.ts` has one `AreaViewFactory` per area kind in `areaViewFactories`; unknown kinds fall back to the translucent dome.

### Turn-start hooks

`sim.registerTurnStartHook(name, (ctx, { teamId, snailId, turnNumber }) => void)`. Hooks run in registration order in the step where `turn.turnNumber` changes, after the `turnStarted` event. `registerLingeringEffects(sim, content)` registers `statuses` then `areas`; crates and sudden death register theirs after. Use `ctx.rng` streams for randomness. `skipTurnIfActiveDead(ctx)` ends the turn when a hook killed the active snail. The very first turn starts before the sim exists and does not trigger hooks.

### Scheduled effects (telegraphed delays)

The `schedule` effect is the one reusable delay mechanism (Beetle Barrage, Snail Mail; a mod can use it for mines, air strikes, delayed heals). Handler: `scheduled/scheduled-system.ts` (`scheduleEffect`). It pushes `ScheduledEffect` entries onto `GameState.scheduled` (`id` `s<n>`, `groupId` `g<n>`, `weaponId`, `ownerSnailId`, `position`, `turnsLeft`, `effects`, `telegraph: { radius, style: 'strike' | 'arrival' }`) and emits `scheduledCreated` per entry. With `line`, `count` entries are spread evenly over `length` metres along x, centred on the detonation point and snapped to the ground; all share one `groupId`.

The `scheduled` turn-start hook (registered by `registerLingeringEffects`, after areas) spends one turn of every entry at **each** turn start, whichever team's; entries reaching 0 are removed in creation order, emit `scheduledFired` and run their `effects` at `position` with the original weapon and owner as source (so a `move` effect teleports the firer, damage credits the owner). Timing: with `turns: N` fired in turn T, the effects run at the start of turn T+N, so `N = 2` shows the marker for the whole of turn T+1 (Beetle Barrage). `N = 1` runs at the very next turn start (Snail Mail: the firer is posted away just before the enemy's turn).

Clients: the protocol snapshot carries `scheduled` (`[id, groupId, x,y,z mm, radius mm, turnsLeft, style]`, decoded as `ScheduledState`) and events `scheduledCreated` / `scheduledFired`. `render/src/effects/scheduled-layer.ts` draws a warning-coloured (`PALETTE.uiAccent`) ground ring and beam per entry, a landing disc for `arrival`, and a line joining the entries of a group. Spore Cloud's look is `sporeView` in `effects/area-views.ts`.

### Crate and wind

```ts
{ id: 'base:health-crate', name: 'Health Crate', kind: 'health', weight: 4, contents: { heal: 25 } }
{ id: 'base:storm', name: 'Storm', minStrength: 5, maxStrength: 10, changesMidFlight: true }
```

`CrateDefinition.kind` is `supply | health | utility | calcium | mystery`; `weight` is the relative drop chance; `contents` may hold `heal`, `weapons: [{ weaponId, count }]`, `calcium`, `statusId`. Wind presets Off, Low, Normal, Storm live in `content-base/src/winds.ts`. Crate drops and mid-flight wind are sim features of later jobs; the data is already validated.

## Planned: technologies, shell upgrades and hooks

Today `TechnologySchema` and `ShellUpgradeSchema` are flat (see `content/schemas.ts`). The richer shapes below are the design for M5.

### Technology

```ts
export const shapedCharges = {
  id: 'base:tech.shaped-charges',
  name: 'Shaped Charges',
  branch: 'weaponry',
  tier: 2,
  cost: { researchPoints: 40 },
  requires: ['base:tech.explosives-101'],
  grants: [
    { type: 'unlockWeapon', weapon: 'base:bazooka-mk2' },
    { type: 'modifyWeapon', weapon: 'base:bazooka', stat: 'effects.0.radius', op: 'mul', value: 1.15 },
  ],
  hooks: [], // optional event-bus subscriptions, see below
} satisfies TechnologyDef;
```

### Shell upgrade

```ts
export const ceramicShell = {
  id: 'base:shell.ceramic',
  name: 'Ceramic Shell',
  requires: ['base:tech.ceramics'],
  stats: { maxHealthBonus: 25, damageTaken: { explosive: 0.85, fall: 1.0 } },
  visual: {
    material: { baseColor: '#e8e2d0', roughness: 0.15, metalness: 0, clearcoat: 1 },
    mesh: 'shells/ceramic.glb', // optional; else base shell + material
    crackProfile: 'brittle',
  },
} satisfies ShellUpgradeDef;
```

### Event bus hooks

A typed bus in `core` fires events during `step()`. Subscribers run synchronously in registration order (packs in load order) and may only read the state view and return _effects_ (damage, status, spawn) which the sim applies deterministically, never mutating state directly. Turn-start hooks (above) are the first real piece of this.

```ts
bus.on('snailDamaged', (e, ctx) => {
  if (ctx.snail(e.snail).hasTech('base:tech.thick-slime')) return ctx.effects.heal(e.snail, e.amount * 0.1);
});
```

Rules: handlers must be pure functions of `(event, ctx)` and use `ctx.rng` for randomness; no wall-clock, no I/O. Events are also forwarded to clients (display VFX) in the same order.

## Content packs

A pack is plain data: `ContentPack = { manifest } & { weapons?, technologies?, shellUpgrades?, crates?, winds?, statuses?, areas? }`. The manifest is `{ id, name, version (semver), author?, dependencies?: { [packId]: range } }`; ranges support `*`, exact, `^`, `~` and `>=`.

```ts
const { registries, order, contentHash } = loadContentPacks([basePack, modPack]);
```

`loadContentPacks` (`content/packs.ts`):

1. Validates manifests and rejects duplicate pack ids.
2. Orders packs dependencies first (ties by pack id, so input order is irrelevant); a cycle, a missing dependency or an unsatisfied range is an error.
3. Registers every definition through the validating registries (errors name pack, kind and id).
4. Checks cross references (`pack-validation.ts`): weapon `requiresTech`, `status` and `spawn` effect ids, area `applyStatus`, crate contents, tech prerequisites, shell upgrade `requiresTech`.
5. Throws one `ContentPackError` whose `errors` lists **every** problem; otherwise deep-freezes the definitions, freezes the registries and returns a deterministic `contentHash` (hash of pack versions and all definitions, independent of input order).

The server loads the base pack this way (`apps/server/src/game/server-content.ts`) and builds each match from the registries (`createMatch({ weapons, statuses, areas, ... })`). Sending `contentHash` in the room handshake is planned.

Planned: behaviour ids registered by code packs (`entry`), `snailsApi` compatibility ranges, JSON content files, asset serving from `/packs/<id>/`, and `overrides`. A pack that needs a new effect type or motion strategy must still land it in core.

## Walkthrough: add a new weapon

1. **Pick the parts.** Reuse the existing effects (`damage`, `carve`, `status`, `spawn`, `move`) and `ballistic` motion. If you need a new motion or effect type, add it first (see above) with a unit test.
2. **Create `packages/content-base/src/weapons/sticky-bomb.ts`** exporting a constant `satisfies WeaponDefinition` with id `base:sticky-bomb`.
3. **Register it** with one export line and one array entry in `weapons/index.ts` (array order is the picker order; the first is the default).
4. **Supporting content.** A status or area it refers to goes in `statuses/` (or an areas file) and into `basePack`. Cross references are checked when the pack loads, so a typo fails `pnpm test`.
5. **Gate it** (optional): `requiresTech` pointing at a technology, or a crate that stocks it.
6. **Test.** Follow `packages/content-base/src/weapons/weapons.test.ts`: fire it from a flat test field at a known seed and assert damage, carve, statuses, areas or position.
7. **AI hint** (planned): the CPU scores weapons generically from their `damage` effects.
8. Run `pnpm lint && pnpm test`.

## Walkthrough: add a new technology

1. Create `packages/content-base/src/techs/ceramics.ts` with a `TechnologyDef`: choose `branch`, `tier`, `cost`, `requires`.
2. Add `grants`: `unlockWeapon`, `unlockShellUpgrade`, `modifyStat`, or `hook` (event-bus handler id).
3. If it needs custom logic, register a hook function under a behaviour id (e.g. `hook.thickSlime`) and reference it in `hooks: ['hook.thickSlime']`.
4. Add to the tech tree layout (position/edges auto-derived from `requires`; optional `uiHint.position` override).
5. Add icon and localisation strings.
6. Tests: tree validation (no cycles, reachable), cost/prerequisite behaviour, and the granted effect. See [technology-research.md](technology-research.md) for balance levers.

## Versioning of content packs

- Packs use semver. `snailsApi` is a semver range against the engine's `CONTENT_API_VERSION`; incompatible packs are refused with a clear message.
- Removing or renaming a definition id is a breaking change (saved games, replays and other packs may reference it). Deprecate first with `deprecated: { replacedBy }`.
- `contentHash` in replays and room handshakes pins exact content; replay loading warns on mismatch.
- Schema changes in `@snails/core` bump `CONTENT_API_VERSION`; a migration function per version upgrades older JSON where feasible.
- The base pack follows the game's version; mods declare the range of `base` they were tested against.
