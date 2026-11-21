# Extensibility

Content is data plus named behaviours ([ADR-0006](adr/0006-data-driven-extensibility.md)). The base game is the content pack `@snails/content-base`; mods use the same API.

## ContentRegistry

`ContentRegistry` (in `@snails/core`) stores validated definitions by kind and id.

```ts
export type ContentKind = 'weapon' | 'technology' | 'shellUpgrade' | 'map' | 'gameMode' | 'behaviour';

export interface ContentRegistry {
  register<K extends ContentKind>(kind: K, def: DefinitionOf<K>, source: PackId): void;
  get<K extends ContentKind>(kind: K, id: string): DefinitionOf<K>;   // throws UnknownContentError
  list<K extends ContentKind>(kind: K): readonly DefinitionOf<K>[];
  registerBehaviour(id: string, fn: BehaviourFn): void;               // named strategies
  freeze(): ContentSnapshot;                                          // immutable, with contentHash
}
```

- Every `register` call runs the kind's zod schema; failures name the pack, kind and id.
- Ids are namespaced `packId:name` (`base:bazooka`). Duplicate ids fail unless the pack declares an explicit `overrides`.
- `freeze()` is called before a match starts. The resulting `contentHash` (hash of sorted definitions + pack versions) is sent in the room handshake ([networking.md](networking.md)).

## Definition schemas

Definitions are plain JSON-compatible objects, authored as TS (type-checked with `satisfies`) or JSON.

### Weapon

```ts
export const bazooka = {
  id: 'base:bazooka',
  name: 'Bazooka',
  icon: 'icons/bazooka.png',
  category: 'explosive',
  ammo: { start: 3, perPickup: 1 },
  requires: [],                                  // technology ids; empty = available at start
  aim: { minPower: 0.1, maxPower: 1, maxPitch: 85 },
  projectile: {
    behaviour: 'projectile.ballistic',           // id of a registered strategy
    params: { speedAtFullPower: 38, gravityScale: 1, windFactor: 0.8, radius: 0.25, fuseSeconds: null },
  },
  explosion: { radius: 3.2, maxDamage: 45, falloff: 'linear', terrainCarve: 1.0, knockback: 14 },
  vfx: { trail: 'vfx.smokeTrail', impact: 'vfx.medExplosion' },
  sfx: { fire: 'sfx.thunk', impact: 'sfx.boomMedium' },
} satisfies WeaponDef;
```

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
    { type: 'modifyWeapon', weapon: 'base:bazooka', stat: 'explosion.radius', op: 'mul', value: 1.15 },
  ],
  hooks: [],                                      // optional event-bus subscriptions, see below
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
    mesh: 'shells/ceramic.glb',                    // optional; else base shell + material
    crackProfile: 'brittle',
  },
} satisfies ShellUpgradeDef;
```

(JSON equivalents are identical; JSON packs are validated at load by the same schemas.)

## Event bus hooks

A typed bus in `core` fires events during `step()`. Subscribers run synchronously in registration order (packs in load order) and may only read the state view and return *effects* (damage, status, spawn) which the sim applies deterministically, never mutating state directly.

```ts
type GameEvents = {
  turnStarted: { team: TeamId; snail: SnailId; turn: number };
  projectileFired: { projectile: ProjectileId; weapon: string; by: SnailId };
  explosion: { at: Vec3; radius: number; weapon: string; by: SnailId };
  snailDamaged: { snail: SnailId; amount: number; source: DamageSource };
  snailDied: { snail: SnailId; killer?: SnailId };
  researchCompleted: { team: TeamId; tech: string };
  turnEnded: { team: TeamId };
};

bus.on('snailDamaged', (e, ctx) => {
  if (ctx.snail(e.snail).hasTech('base:tech.thick-slime')) return ctx.effects.heal(e.snail, e.amount * 0.1);
});
```

Rules: handlers must be pure functions of `(event, ctx)` and use `ctx.rng` for randomness; no wall-clock, no I/O. Events are also forwarded to clients (display VFX) in the same order.

## Behaviours: named strategies

Data never contains code. It references a behaviour id, parameterised by `params`; code registers the function:

```ts
registry.registerBehaviour('projectile.ballistic', (ctx, params: BallisticParams) => ({
  step: (p, dt) => integrateBallistic(p, dt, ctx.wind, params),
  onImpact: (p, hit) => ctx.explode(p.owner, hit.point, ctx.weapon.explosion),
}));
```

Built-in families: `projectile.*` (ballistic, bouncing, homing, cluster, mine), `aim.*`, `movement.*`, `ai.*` (CPU considers weapon-specific scoring), `victory.*`. A definition naming an unknown behaviour fails at `freeze()`, not mid-match.

## Content packs

Manifest (`pack.json` or exported object):

```json
{
  "id": "acme-pack",
  "name": "Acme Explosives",
  "version": "1.2.0",
  "snailsApi": "^1.0.0",
  "depends": { "base": "^1.0.0" },
  "entry": "dist/index.js",
  "contentFiles": ["content/weapons/*.json", "content/techs/*.json"],
  "overrides": []
}
```

Loading order:

1. Resolve `depends` into a DAG (cycle = error); topological order, ties broken by pack id.
2. `base` pack first, then dependencies, then the pack itself.
3. Per pack: register behaviours from `entry` -> register JSON/TS definitions -> run hooks registration.
4. Validate cross-references (tech `requires`, weapon `requires`, behaviour ids, asset paths) after all packs load; report all errors together.
5. `freeze()` and compute `contentHash`.

The server loads packs and sends the pack list + hashes in the lobby; the display and controller fetch visual assets (icons, meshes) from `/packs/<id>/...` served by the server.

## Walkthrough: add a new weapon

1. **Pick behaviour.** Reuse `projectile.ballistic`, or add a new strategy in `packages/content-base/src/behaviours/` and register it (with a unit test).
2. **Create the definition** `packages/content-base/src/weapons/sticky-bomb.ts` using `satisfies WeaponDef` (see the example above).
3. **Export it** from `weapons/index.ts` so `registerBasePack()` registers it.
4. **Add assets**: icon, optional VFX ids (reuse existing), SFX.
5. **Gate it** (optional): add a technology that `unlockWeapon`s it, or add to starting loadout in the game mode definition.
6. **Test**: in `content-base`, a test that the registry freezes; in `core`, a determinism test firing the weapon at a known seed and asserting terrain/damage results.
7. **AI hint** (optional): add `aiHints` (preferred range, splash) so CPUs can use it; otherwise they use generic scoring from explosion radius/damage.
8. Run `pnpm lint && pnpm test`; start `pnpm dev` and pick it from the controller's weapon list.

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
