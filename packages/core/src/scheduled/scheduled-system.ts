import type { EffectOf } from '../content/effects/effect-schemas.js';
import { runEffects, type EffectSource } from '../content/effects/handlers.js';
import { withContent, type EffectContext, type MatchContent } from '../content/match-content.js';
import type { SimContext } from '../sim/types.js';
import type { Simulation } from '../sim/simulation.js';
import type { ScheduledEffect, Vec3 } from '../state/types.js';
import { findGround } from '../terrain/collision.js';
import { skipTurnIfActiveDead } from '../turn/turn-hooks.js';

/** Metres above the target the ground probe starts, and how far down it looks. */
const SNAP_UP = 25;
const SNAP_DOWN = 60;

/** Points of a barrage line: `count` evenly spaced over `length` m along x, centred on `at`. */
function linePoints(at: Vec3, count: number, length: number): Vec3[] {
  return Array.from({ length: count }, (_, i) => ({
    x: at.x + (i / (count - 1) - 0.5) * length,
    y: at.y,
    z: at.z,
  }));
}

/** Drops a point onto the terrain surface below it (unchanged if there is none). */
function snapToGround(ctx: SimContext, p: Vec3): Vec3 {
  const hit = findGround(ctx.terrain, { x: p.x, y: p.y + SNAP_UP, z: p.z }, SNAP_UP + SNAP_DOWN);
  return hit ? { x: p.x, y: hit.point.y, z: p.z } : p;
}

/**
 * Handler body of the `schedule` effect: queues the effects (one entry, or one per shell with
 * `line`) in `GameState.scheduled`, emitting `scheduledCreated` for each so clients can
 * telegraph the target. Entries of one call share a `groupId`.
 */
export function scheduleEffect(
  ctx: SimContext,
  e: EffectOf<'schedule'>,
  at: Vec3,
  source: EffectSource,
): void {
  const state = ctx.state;
  const groupId = `g${state.nextScheduledId}`;
  const points = e.line
    ? linePoints(at, e.line.count, e.line.length).map((p) => snapToGround(ctx, p))
    : [{ ...at }];
  for (const position of points) {
    const entry: ScheduledEffect = {
      id: `s${state.nextScheduledId}`,
      groupId,
      weaponId: source.weaponId,
      ownerSnailId: source.ownerSnailId,
      position,
      turnsLeft: e.turns,
      effects: e.effects.map((x) => ({ ...x })),
      telegraph: { radius: e.telegraph.radius, style: e.telegraph.style ?? 'strike' },
    };
    state.nextScheduledId += 1;
    state.scheduled.push(entry);
    ctx.emit({
      type: 'scheduledCreated',
      scheduledId: entry.id,
      groupId,
      weaponId: entry.weaponId,
      position: { ...position },
      turnsLeft: entry.turnsLeft,
      radius: entry.telegraph.radius,
      style: entry.telegraph.style,
    });
  }
}

/**
 * Turn-start hook body: every scheduled effect spends one turn; those reaching 0 are removed
 * and their effects run at their position, in creation order (`scheduledFired` first). If the
 * active snail dies, its turn is skipped.
 */
export function processScheduledAtTurnStart(ctx: EffectContext): void {
  const due: ScheduledEffect[] = [];
  for (const s of ctx.state.scheduled) {
    s.turnsLeft -= 1;
    if (s.turnsLeft <= 0) due.push(s);
  }
  if (due.length === 0) return;
  ctx.state.scheduled = ctx.state.scheduled.filter((s) => s.turnsLeft > 0);
  for (const s of due) {
    ctx.emit({
      type: 'scheduledFired',
      scheduledId: s.id,
      groupId: s.groupId,
      position: { ...s.position },
    });
    runEffects(ctx, s.effects, s.position, { weaponId: s.weaponId, ownerSnailId: s.ownerSnailId });
  }
  skipTurnIfActiveDead(ctx);
}

/** Registers the `scheduled` turn-start hook for `content`. */
export function registerScheduledHook(sim: Simulation, content: MatchContent): void {
  sim.registerTurnStartHook('scheduled', (ctx) =>
    processScheduledAtTurnStart(withContent(ctx, content)),
  );
}
