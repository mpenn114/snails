import type { ContentRegistry } from '../content/registry.js';
import type { StatusDefinition } from '../content/types.js';
import { applyDamage } from '../entities/snail.js';
import type { SimContext } from '../sim/types.js';
import type { Snail } from '../state/types.js';
import { skipTurnIfActiveDead } from '../turn/turn-hooks.js';

/** How a status is applied. */
export interface StatusApplication {
  /** Duration in turns of the afflicted snail's team. */
  turns: number;
  /** Strength multiplier (default 1). */
  magnitude?: number;
  sourceSnailId: string;
}

/** Removes a status from a snail if present, emitting `statusExpired`. */
export function removeStatus(ctx: SimContext, snail: Snail, statusId: string): void {
  const list = snail.statuses;
  if (!list) return;
  const i = list.findIndex((s) => s.id === statusId);
  if (i < 0) return;
  list.splice(i, 1);
  ctx.emit({ type: 'statusExpired', snailId: snail.id, statusId });
}

/**
 * Applies a status to a living snail and emits `statusApplied`. Re-applying the same status
 * refreshes it (longest duration and largest magnitude win; statuses never stack). Statuses
 * listed in the definition's `cures` are removed first.
 */
export function applyStatus(
  ctx: SimContext,
  snail: Snail,
  def: StatusDefinition,
  app: StatusApplication,
): void {
  if (!snail.alive) return;
  const list = (snail.statuses ??= []);
  for (const cured of def.cures ?? []) removeStatus(ctx, snail, cured);
  const magnitude = app.magnitude ?? 1;
  const existing = list.find((s) => s.id === def.id);
  const inst = existing ?? {
    id: def.id,
    turnsLeft: 0,
    magnitude,
    sourceSnailId: app.sourceSnailId,
  };
  if (!existing) list.push(inst);
  inst.turnsLeft = Math.max(inst.turnsLeft, app.turns);
  inst.magnitude = Math.max(inst.magnitude, magnitude);
  inst.sourceSnailId = app.sourceSnailId;
  ctx.emit({
    type: 'statusApplied',
    snailId: snail.id,
    statusId: def.id,
    turnsLeft: inst.turnsLeft,
    magnitude: inst.magnitude,
    sourceSnailId: app.sourceSnailId,
  });
}

/** Product of the crawl-speed multipliers of the snail's statuses (1 if none). */
export function statusMoveSpeedMultiplier(
  snail: Snail,
  statuses: ContentRegistry<StatusDefinition>,
): number {
  let m = 1;
  for (const s of snail.statuses ?? []) m *= statuses.get(s.id)?.moveSpeedMultiplier ?? 1;
  return m;
}

function tickSnail(
  ctx: SimContext,
  snail: Snail,
  statuses: ContentRegistry<StatusDefinition>,
): void {
  for (const inst of [...(snail.statuses ?? [])]) {
    const def = statuses.get(inst.id);
    if (!snail.alive || !def) {
      removeStatus(ctx, snail, inst.id);
      continue;
    }
    const amount = Math.round((def.perTurnDamage ?? 0) * inst.magnitude);
    const result = applyDamage(snail, amount);
    if (result.dealt > 0) {
      ctx.emit({
        type: 'snailDamaged',
        snailId: snail.id,
        amount: result.dealt,
        remaining: snail.health,
        sourceSnailId: inst.sourceSnailId,
        cause: 'status',
      });
    }
    if (result.killed) {
      ctx.emit({ type: 'snailDied', snailId: snail.id, teamId: snail.teamId, cause: 'status' });
    }
    inst.turnsLeft -= 1;
    if (inst.turnsLeft <= 0 || !snail.alive) removeStatus(ctx, snail, inst.id);
  }
}

/**
 * Turn-start hook body: for each snail of the team (dead ones just lose their statuses) whose turn begins (in team order),
 * every status deals its per-turn damage, then loses one turn and expires at 0. A status of
 * N turns therefore ticks N times, at the starts of that team's next N turns. If the active
 * snail dies, its turn is skipped.
 */
export function processStatusesAtTurnStart(
  ctx: SimContext,
  statuses: ContentRegistry<StatusDefinition>,
): void {
  const team = ctx.state.teams.find((t) => t.id === ctx.state.turn.activeTeamId);
  for (const snail of team?.snails ?? []) tickSnail(ctx, snail, statuses);
  skipTurnIfActiveDead(ctx);
}
