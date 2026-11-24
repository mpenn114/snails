import type { MatchContent } from '../content/match-content.js';
import type { CrateDefinition } from '../content/types.js';
import { applyDamage, heal } from '../entities/snail.js';
import { addCalcium } from '../research/calcium.js';
import type { SimContext } from '../sim/types.js';
import { applyStatus } from '../status/status-system.js';
import type { Crate, Snail, Team } from '../state/types.js';
import { MYSTERY_DAMAGE } from './crate-rules.js';

type Grant = { weaponId: string; count: number }[];

/** One resolved outcome: what a crate does to the snail that opens it. */
interface Outcome {
  heal: number;
  damage: number;
  weapons: Grant;
  statusId?: string;
}

/** Adds weapon stock to a team's inventory (the M4-15 hook point for ammo). */
export function grantWeapons(team: Team, weapons: Grant): void {
  if (weapons.length === 0) return;
  const inv = (team.inventory ??= {});
  for (const w of weapons) inv[w.weaponId] = (inv[w.weaponId] ?? 0) + w.count;
}

/**
 * The mystery table: every outcome the definition's contents allow, in a fixed order (heal,
 * damage, weapons, status). `heal` and `weapons` are good, `damage` (a fixed non-lethal
 * amount) is bad, and `statusId` is whatever status the content names (e.g. goo).
 */
function mysteryTable(def: CrateDefinition): Outcome[] {
  const c = def.contents;
  const table: Outcome[] = [
    { heal: c.heal ?? 25, damage: 0, weapons: [] },
    { heal: 0, damage: MYSTERY_DAMAGE, weapons: [] },
  ];
  if (c.weapons && c.weapons.length > 0) table.push({ heal: 0, damage: 0, weapons: c.weapons });
  if (c.statusId) table.push({ heal: 0, damage: 0, weapons: [], statusId: c.statusId });
  return table;
}

function resolveOutcome(ctx: SimContext, def: CrateDefinition): Outcome {
  if (def.kind === 'mystery') {
    const table = mysteryTable(def);
    return table[ctx.rng.crates.int(0, table.length - 1)] as Outcome;
  }
  const c = def.contents;
  return {
    heal: c.heal ?? 0,
    damage: 0,
    weapons: c.weapons ?? [],
    ...(c.statusId ? { statusId: c.statusId } : {}),
  };
}

/**
 * Applies a crate's contents to `snail` and emits `crateCollected` (and `snailDamaged` for a
 * bad mystery outcome). The caller removes the crate. Calcium contents go to the team's
 * research bank (no-op when research is off).
 */
export function collectCrate(
  ctx: SimContext,
  content: MatchContent,
  crate: Crate,
  snail: Snail,
): void {
  const def = content.crates.get(crate.defId);
  if (!def) return;
  const out = resolveOutcome(ctx, def);
  const healed = heal(snail, out.heal);
  // A bad mystery outcome hurts but never kills.
  const hurt = out.damage > 0 ? Math.min(out.damage, Math.max(0, snail.health - 1)) : 0;
  if (hurt > 0) {
    applyDamage(snail, hurt);
    ctx.emit({
      type: 'snailDamaged',
      snailId: snail.id,
      amount: hurt,
      remaining: snail.health,
      sourceSnailId: null,
      cause: 'crate',
    });
  }
  const team = ctx.state.teams.find((t) => t.id === snail.teamId);
  if (team) grantWeapons(team, out.weapons);
  if (def.contents.calcium) addCalcium(ctx, snail.teamId, def.contents.calcium, 'crate');
  const status = out.statusId ? content.statuses.get(out.statusId) : undefined;
  if (status) {
    applyStatus(ctx, snail, status, {
      turns: status.defaultTurns ?? 1,
      sourceSnailId: snail.id,
    });
  }
  ctx.emit({
    type: 'crateCollected',
    crateId: crate.id,
    defId: crate.defId,
    snailId: snail.id,
    position: { ...crate.position },
    healed,
    damage: hurt,
    weapons: out.weapons.map((w) => ({ ...w })),
    ...(status ? { statusId: status.id } : {}),
  });
}
