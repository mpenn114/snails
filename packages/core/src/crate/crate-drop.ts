import type { ContentRegistry } from '../content/registry.js';
import type { CrateDefinition } from '../content/types.js';
import type { Rng } from '../rng.js';
import type { SimContext } from '../sim/types.js';
import type { Crate, GameState, Vec3 } from '../state/types.js';
import { rayCast } from '../terrain/collision.js';
import { groundIsOpen } from '../terrain/reachability.js';
import {
  type CrateRules,
  DROP_HEIGHT,
  MIN_ABOVE_WATER,
  MIN_CRATE_DISTANCE,
  MIN_SNAIL_DISTANCE,
  MIN_SURFACE_NORMAL_Y,
  PLACEMENT_ATTEMPTS,
} from './crate-rules.js';

/** Edge margin (cells) kept free of drops. */
const EDGE_MARGIN = 3;

/**
 * Round number (1-based) of a turn: one round is one turn per team, in team order. Teams that
 * are eliminated still count, so round numbers do not shift when a team dies.
 */
export function roundOf(state: GameState): number {
  return Math.floor((state.turn.turnNumber - 1) / Math.max(1, state.teams.length)) + 1;
}

/** True on the first turn of every `intervalRounds`-th round (rounds 3, 6, 9, ... by default). */
export function isDropTurn(state: GameState, rules: CrateRules): boolean {
  const teams = Math.max(1, state.teams.length);
  const firstOfRound = (state.turn.turnNumber - 1) % teams === 0;
  return firstOfRound && roundOf(state) % Math.max(1, rules.intervalRounds) === 0;
}

function horizontal(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Picks a spawn point (in the air above a landing spot) from the `crates` RNG stream: solid,
 * fairly flat ground clear of water, snails and other crates, that a snail can actually walk to (part of a connected standable region of at least 60 m^2, not an islet or ledge). Returns null after
 * `PLACEMENT_ATTEMPTS` failed tries. Consumes two draws per attempt, so it is deterministic
 * for a given seed and state.
 */
export function pickDropSite(ctx: SimContext): Vec3 | null {
  const grid = ctx.terrain;
  const rng: Rng = ctx.rng.crates;
  const cs = grid.cellSize;
  const topY = (grid.ny - 1) * cs - 0.5;
  const snails = ctx.state.teams.flatMap((t) => t.snails).filter((s) => s.alive);
  for (let i = 0; i < PLACEMENT_ATTEMPTS; i++) {
    const x = rng.range(EDGE_MARGIN * cs, (grid.nx - 1 - EDGE_MARGIN) * cs);
    const z = rng.range(EDGE_MARGIN * cs, (grid.nz - 1 - EDGE_MARGIN) * cs);
    const hit = rayCast(grid, { x, y: topY, z }, { x: 0, y: -1, z: 0 }, topY + 1);
    if (!hit || hit.distance <= 0) continue;
    const ground = hit.point;
    if (ground.y < ctx.state.terrain.waterLevel + MIN_ABOVE_WATER) continue;
    if (hit.normal.y < MIN_SURFACE_NORMAL_Y) continue;
    if (snails.some((s) => horizontal(s.position, ground) < MIN_SNAIL_DISTANCE)) continue;
    if (ctx.state.crates.some((c) => horizontal(c.position, ground) < MIN_CRATE_DISTANCE)) continue;
    if (!groundIsOpen(grid, ctx.state.terrain.waterLevel, ground)) continue;
    return { x, y: Math.min(topY, ground.y + DROP_HEIGHT), z };
  }
  return null;
}

/**
 * Picks a crate definition by weight from the `crates` stream. Calcium crates are skipped unless
 * research is on. Returns null when nothing can drop.
 */
export function pickCrateDefinition(
  ctx: SimContext,
  registry: ContentRegistry<CrateDefinition>,
): CrateDefinition | null {
  const defs = registry
    .list()
    .filter((d) => d.kind !== 'calcium' || (ctx.state.research ?? 'off') !== 'off');
  const total = defs.reduce((n, d) => n + d.weight, 0);
  if (defs.length === 0 || !(total > 0)) return null;
  let roll = ctx.rng.crates.next() * total;
  for (const d of defs) {
    roll -= d.weight;
    if (roll < 0) return d;
  }
  return defs[defs.length - 1] ?? null;
}

/**
 * Drops one crate if fewer than `rules.maxOnMap` are on the map: weighted definition, then a
 * placement. Emits `crateSpawned`. Returns the crate, or null if nothing was dropped.
 */
export function dropCrate(
  ctx: SimContext,
  registry: ContentRegistry<CrateDefinition>,
  rules: CrateRules,
): Crate | null {
  if (ctx.state.crates.length >= rules.maxOnMap) return null;
  const def = pickCrateDefinition(ctx, registry);
  if (!def) return null;
  const site = pickDropSite(ctx);
  if (!site) return null;
  const crate: Crate = {
    id: `c${ctx.state.nextCrateId}`,
    defId: def.id,
    position: site,
    velocity: { x: 0, y: 0, z: 0 },
    grounded: false,
  };
  ctx.state.nextCrateId += 1;
  ctx.state.crates.push(crate);
  ctx.emit({ type: 'crateSpawned', crateId: crate.id, defId: def.id, position: { ...site } });
  return crate;
}
