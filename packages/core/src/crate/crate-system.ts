import type { MatchContent } from '../content/match-content.js';
import { livingSnails } from '../entities/snail.js';
import { distance } from '../math/vec3.js';
import { WORLD_FLOOR_Y } from '../physics/projectile-system.js';
import type { Simulation } from '../sim/simulation.js';
import type { SimContext, SystemFn } from '../sim/types.js';
import type { Crate } from '../state/types.js';
import { destroyCrate } from './crate-destroy.js';
import { dropCrate, isDropTurn } from './crate-drop.js';
import { collectCrate } from './crate-pickup.js';
import {
  CRATE_GRAVITY,
  CRATE_RADIUS,
  DEFAULT_CRATE_RULES,
  type CrateRules,
  PARACHUTE_SPEED,
  PICKUP_RADIUS,
} from './crate-rules.js';

/** Probe distance below a resting crate used to notice that its ground was carved away. */
const SUPPORT_PROBE = 0.15;

function supported(ctx: SimContext, crate: Crate): boolean {
  const probe = { ...crate.position, y: crate.position.y - SUPPORT_PROBE };
  return ctx.terrain.sampleLinear(probe) <= CRATE_RADIUS;
}

/** Advances one crate: parachutes at terminal speed, lands on terrain, falls again if undercut. */
function stepCrate(ctx: SimContext, crate: Crate): void {
  if (crate.grounded) {
    if (supported(ctx, crate)) return;
    crate.grounded = false;
  }
  const vy = Math.max(crate.velocity.y - CRATE_GRAVITY * ctx.dt, -PARACHUTE_SPEED);
  crate.velocity = { x: 0, y: vy, z: 0 };
  crate.position = { ...crate.position, y: crate.position.y + vy * ctx.dt };
  if (ctx.terrain.sampleLinear(crate.position) <= CRATE_RADIUS) {
    crate.grounded = true;
    crate.velocity = { x: 0, y: 0, z: 0 };
    ctx.emit({ type: 'crateLanded', crateId: crate.id, position: { ...crate.position } });
  }
}

/**
 * Creates the crate system: moves every crate, removes ones that fell into the water or out of
 * the world, then lets any living snail within `PICKUP_RADIUS` collect a crate on contact
 * (crates in drop order, snails in team order). Collecting is immediate and free: the design's
 * "free turn action to open" is not implemented.
 */
export function crateSystem(content: MatchContent): SystemFn {
  return (ctx) => {
    for (const crate of [...ctx.state.crates]) {
      stepCrate(ctx, crate);
      const low = Math.max(ctx.state.terrain.waterLevel - CRATE_RADIUS, WORLD_FLOOR_Y);
      if (crate.position.y < low) destroyCrate(ctx, crate.id, 'water');
    }
    for (const crate of [...ctx.state.crates]) {
      const snail = livingSnails(ctx.state).find(
        (s) => distance(s.position, crate.position) <= PICKUP_RADIUS,
      );
      if (!snail) continue;
      ctx.state.crates.splice(ctx.state.crates.indexOf(crate), 1);
      collectCrate(ctx, content, crate, snail);
    }
  };
}

/**
 * Registers the crate system and the `crates` turn-start hook (a drop on the first turn of
 * every `intervalRounds`-th round). Call after `registerLingeringEffects` so hook order
 * stays statuses, areas, crates.
 */
export function registerCrates(
  sim: Simulation,
  content: MatchContent,
  rules: Partial<CrateRules> = {},
): void {
  const merged: CrateRules = { ...DEFAULT_CRATE_RULES, ...rules };
  sim.addSystem('crates', crateSystem(content));
  sim.registerTurnStartHook('crates', (ctx) => {
    if (isDropTurn(ctx.state, merged)) dropCrate(ctx, content.crates, merged);
  });
}
