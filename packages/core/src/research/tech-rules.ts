import type { TechnologyDefinition } from '../content/types.js';
import type { GameState, Team } from '../state/types.js';
import { costScale } from './anti-snowball.js';

/** Most techs that may wait in a team's queue (the active tech is not counted). */
export const MAX_QUEUED = 2;

/** Minimal technology lookup (a `ContentRegistry` satisfies it). */
export interface TechRegistry {
  get(id: string): TechnologyDefinition | undefined;
}

/** Why a tech cannot be queued or started. */
export type ResearchRejection =
  | 'RESEARCH_OFF'
  | 'UNKNOWN_TEAM'
  | 'UNKNOWN_TECH'
  | 'ALREADY_RESEARCHED'
  | 'ALREADY_QUEUED'
  | 'TIER_LOCKED'
  | 'PREREQ_MISSING'
  | 'CAPSTONE_LIMIT'
  | 'QUEUE_FULL'
  | 'NOT_QUEUED';

/** Outcome of {@link canResearch}. */
export type ResearchCheck =
  { ok: true } | { ok: false; reason: ResearchRejection; message: string };

/**
 * Calcium a team pays to start `def`: base cost +5% per tech the team owns (flat across tiers),
 * rounded up; fast mode then halves it, rounded up.
 */
export function techCost(state: GameState, team: Team, def: TechnologyDefinition): number {
  const scaled = Math.ceil(def.cost * costScale(team.researched.length) - 1e-9);
  return state.research === 'fast' ? Math.ceil(scaled * 0.5) : scaled;
}

/** Team turns `def` takes (fast mode: one fewer, never below 1). */
export function techTurns(state: GameState, def: TechnologyDefinition): number {
  const turns = def.researchTurns ?? 1;
  return state.research === 'fast' ? Math.max(1, turns - 1) : turns;
}

function fail(reason: ResearchRejection, message: string): ResearchCheck {
  return { ok: false, reason, message };
}

/** Tech ids the team has, is researching or has queued. */
function willHave(team: Team, forStart: boolean): Set<string> {
  const have = new Set(team.researched);
  if (forStart || !team.research) return have;
  if (team.research.active) have.add(team.research.active.techId);
  for (const id of team.research.queue) have.add(id);
  return have;
}

function capstoneCount(have: Set<string>, registry: TechRegistry): number {
  let n = 0;
  for (const id of have) if (registry.get(id)?.capstone) n += 1;
  return n;
}

/**
 * Checks whether `team` may queue `def` (or, with `forStart`, begin work on it now). Queue checks
 * count completed, active and queued techs as "will have"; start checks count completed only.
 * @returns ok, or a stable reason code with a message.
 */
export function canResearch(
  state: GameState,
  team: Team,
  def: TechnologyDefinition | undefined,
  registry: TechRegistry,
  forStart = false,
): ResearchCheck {
  if (!state.research || state.research === 'off' || !team.research) {
    return fail('RESEARCH_OFF', 'research is off');
  }
  if (!def) return fail('UNKNOWN_TECH', 'unknown technology');
  if (team.researched.includes(def.id)) return fail('ALREADY_RESEARCHED', `${def.id} is done`);
  const r = team.research;
  if (r.active?.techId === def.id || r.queue.includes(def.id)) {
    if (!forStart) return fail('ALREADY_QUEUED', `${def.id} is already queued`);
  }
  if (!forStart && r.queue.length >= MAX_QUEUED) return fail('QUEUE_FULL', 'the queue is full');
  const have = willHave(team, forStart);
  if (def.tier > 0 && have.size < def.tier - 1 + (forStart ? 0 : 0)) {
    return fail('TIER_LOCKED', `tier ${def.tier} needs ${def.tier - 1} techs`);
  }
  const missing = def.prerequisites.some((p) => !have.has(p));
  const anyOk = !def.anyOf || def.anyOf.length === 0 || def.anyOf.some((p) => have.has(p));
  if (missing || !anyOk) return fail('PREREQ_MISSING', `${def.id} prerequisites are missing`);
  if (def.capstone && capstoneCount(have, registry) > 0) {
    return fail('CAPSTONE_LIMIT', 'one capstone per team');
  }
  return { ok: true };
}
