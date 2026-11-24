import {
  MAX_QUEUED,
  Rng,
  canResearch,
  techCost,
  type Command,
  type GameState,
  type MatchSetup,
  type Team,
  type TechnologyDefinition,
} from '@snails/core';
import type { Difficulty } from '../cpu/types.js';
import type { PersonalityProfile } from '../cpu/personalities.js';
import { isArmourTech, isDamageTech, opponentView, techValue } from './tech-value.js';

/** Everything the planner reads, bundled to keep helper signatures short. */
interface Ctx {
  state: GameState;
  team: Team;
  techs: readonly TechnologyDefinition[];
  byId: Map<string, TechnologyDefinition>;
  registry: { get(id: string): TechnologyDefinition | undefined };
}

/** Suffix of a tech id after the last `:` (pack prefix removed). */
function suffix(id: string): string {
  return id.slice(id.lastIndexOf(':') + 1);
}

function isValid(ctx: Ctx, def: TechnologyDefinition): boolean {
  const check = canResearch(ctx.state, ctx.team, def, ctx.registry);
  return check.ok || check.reason === 'QUEUE_FULL';
}

/** Hash of the match seed, team id and research progress, so seeded picks vary but replay. */
function seededRng(ctx: Ctx, teamId: string): Rng {
  let h = ctx.state.seed >>> 0;
  for (const ch of teamId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const r = ctx.team.research;
  h = Math.imul(h ^ (ctx.team.researched.length + 1), 2246822519) >>> 0;
  h = Math.imul(h ^ ((r?.queue.length ?? 0) + 7), 3266489917) >>> 0;
  return new Rng(h);
}

/** Calcium already promised to queued techs (paid when each starts). */
function reserved(ctx: Ctx): number {
  const r = ctx.team.research;
  if (!r) return 0;
  let sum = 0;
  for (const id of r.queue) {
    const def = ctx.byId.get(id);
    if (def) sum += techCost(ctx.state, ctx.team, def);
  }
  return sum;
}

/** Multiplier from counter-picking what the team can see of its opponents. */
function counterFactor(
  def: TechnologyDefinition,
  seen: ReadonlySet<string>,
  scouting: boolean,
): number {
  let f = 1;
  if (seen.has('armour') && isDamageTech(def)) f *= 1.8;
  if (seen.has('armour') && isArmourTech(def)) f *= 0.8;
  if (scouting && suffix(def.id) === 'calcified-shell') f *= 2.5;
  else if (scouting && def.branch === 'shell') f *= 1.15;
  return f;
}

/** Fallback score: value per Calcium, tier aware, with counter-picks. */
function score(
  ctx: Ctx,
  def: TechnologyDefinition,
  seen: ReadonlySet<string>,
  scouting: boolean,
): number {
  const cost = Math.max(1, techCost(ctx.state, ctx.team, def));
  return (techValue(def) * counterFactor(def, seen, scouting)) / cost;
}

function visibleSet(ctx: Ctx): { seen: Set<string>; scouting: boolean } {
  const view = opponentView(ctx.state, ctx.team, (id) => ctx.byId.get(id));
  const seen = new Set<string>();
  if (view.visibleTechIds.some((id) => isArmourTech(ctx.byId.get(id)))) seen.add('armour');
  return { seen, scouting: view.scouting };
}

/** Techs still missing on the cheapest path to `target` (including it), or null if unreachable. */
function missingPath(ctx: Ctx, target: TechnologyDefinition, depth = 0): Set<string> | null {
  const have = new Set(ctx.team.researched);
  const out = new Set<string>();
  if (have.has(target.id)) return out;
  if (depth > 8) return null;
  out.add(target.id);
  const need = (id: string): boolean => {
    const dep = ctx.byId.get(id);
    const sub = dep ? missingPath(ctx, dep, depth + 1) : null;
    if (!sub) return false;
    for (const s of sub) out.add(s);
    return true;
  };
  for (const id of target.prerequisites) if (!have.has(id) && !need(id)) return null;
  const any = target.anyOf ?? [];
  if (any.length > 0 && !any.some((id) => have.has(id))) {
    const paths = any
      .map((id) => ctx.byId.get(id))
      .map((d) => (d ? missingPath(ctx, d, depth + 1) : null))
      .filter((p): p is Set<string> => p !== null)
      .sort((a, b) => pathCost(ctx, a) - pathCost(ctx, b));
    if (!paths[0]) return null;
    for (const s of paths[0]) out.add(s);
  }
  return out;
}

function pathCost(ctx: Ctx, ids: Set<string>): number {
  let sum = 0;
  for (const id of ids) sum += ctx.byId.get(id)?.cost ?? 0;
  return sum;
}

/** Research race: the cheapest path to a capstone the team can still win with. */
function racePath(ctx: Ctx): Set<string> | null {
  const caps = ctx.state.raceCapstones;
  const targets = ctx.techs.filter((t) => (caps ? caps.includes(t.id) : t.capstone));
  let best: Set<string> | null = null;
  for (const t of targets) {
    const p = missingPath(ctx, t);
    if (p && (!best || pathCost(ctx, p) < pathCost(ctx, best))) best = p;
  }
  return best;
}

/** First valid, unqueued entry of the personality's build order. */
function fromBuildOrder(ctx: Ctx, order: readonly string[]): TechnologyDefinition | null {
  for (const entry of order) {
    const def = ctx.techs.find((t) => suffix(t.id) === suffix(entry));
    if (def && isValid(ctx, def)) return def;
  }
  return null;
}

/** Best valid tech by fallback score; ties break by id. */
function bestByScore(ctx: Ctx, pool: readonly TechnologyDefinition[]): TechnologyDefinition | null {
  const { seen, scouting } = visibleSet(ctx);
  let best: TechnologyDefinition | null = null;
  let bestScore = -Infinity;
  for (const def of pool) {
    const s = score(ctx, def, seen, scouting);
    if (s > bestScore + 1e-12 || (Math.abs(s - bestScore) <= 1e-12 && best && def.id < best.id)) {
      best = def;
      bestScore = s;
    }
  }
  return best;
}

/** Rookie: one of the three cheapest affordable valid techs, picked by a seeded choice. */
function rookiePick(ctx: Ctx, teamId: string, budget: number): TechnologyDefinition | null {
  const affordable = ctx.techs
    .filter((t) => isValid(ctx, t) && techCost(ctx.state, ctx.team, t) <= budget)
    .sort(
      (a, b) =>
        techCost(ctx.state, ctx.team, a) - techCost(ctx.state, ctx.team, b) ||
        (a.id < b.id ? -1 : 1),
    );
  const top = affordable.slice(0, 3);
  return top[Math.floor(seededRng(ctx, teamId).next() * top.length)] ?? null;
}

/** Chooses the target tech for a non-rookie team (race path, build order, then scoring). */
function chooseTarget(
  ctx: Ctx,
  profile: PersonalityProfile,
  race: boolean,
): TechnologyDefinition | null {
  const valid = ctx.techs.filter((t) => isValid(ctx, t));
  if (race) {
    const path = racePath(ctx);
    const onPath = valid.filter((t) => path?.has(t.id));
    const pick = bestByScore(ctx, onPath);
    if (pick) return pick;
  }
  return fromBuildOrder(ctx, profile.buildOrder) ?? bestByScore(ctx, valid);
}

/** A queued, off-plan tech that a much better one now beats; refunds nothing lost (free cancel). */
function staleQueued(ctx: Ctx, profile: PersonalityProfile): string | null {
  const queue = ctx.team.research?.queue ?? [];
  const planned = new Set(profile.buildOrder.map(suffix));
  const { seen, scouting } = visibleSet(ctx);
  const best = bestByScore(
    ctx,
    ctx.techs.filter((t) => isValid(ctx, t)),
  );
  if (!best) return null;
  const top = score(ctx, best, seen, scouting);
  for (const id of queue) {
    const def = ctx.byId.get(id);
    if (!def || planned.has(suffix(id))) continue;
    if (top > 3 * score(ctx, def, seen, scouting) && best.id !== id) return id;
  }
  return null;
}

/**
 * Plans the research commands a CPU team issues now: at most one `queueResearch`, or (rarely, on
 * veteran and above) a `cancelResearch` of a stale off-plan queued tech. Empty when research is
 * off, the team has no research state, the queue is full, or the best tech is not yet affordable.
 *
 * Choice order: research-race path to a capstone (race mode), the first valid build-order entry
 * (ids match by suffix after `:`), then `value/cost` scoring with tier awareness and counter-picks
 * against opponents' visible research. Rookies skip the plan and buy a seeded pick among the
 * cheapest affordable techs; everyone else saves up rather than buying junk.
 * @param match - The running match (read only).
 * @param teamId - The CPU's team.
 * @param profile - Personality profile holding the build order.
 * @param difficulty - Skill level.
 * @returns Commands to submit this turn.
 */
export function planCpuResearch(
  match: MatchSetup,
  teamId: string,
  profile: PersonalityProfile,
  difficulty: Difficulty,
): Command[] {
  const state = match.sim.state;
  const team = state.teams.find((t) => t.id === teamId);
  const research = team?.research;
  if (!team || !research || !state.research || state.research === 'off') return [];
  const techs = match.content.technologies.list();
  const registry = match.content.technologies;
  const ctx: Ctx = { state, team, techs, byId: new Map(techs.map((t) => [t.id, t])), registry };
  const advanced = difficulty === 'veteran' || difficulty === 'mastermind';
  if (advanced && research.queue.length > 0) {
    const stale = staleQueued(ctx, profile);
    if (stale) return [{ type: 'cancelResearch', teamId, techId: stale }];
  }
  if (research.queue.length >= MAX_QUEUED) return [];
  const budget = research.calcium - reserved(ctx);
  const race = state.raceCapstones !== undefined;
  const pick =
    difficulty === 'rookie' ? rookiePick(ctx, teamId, budget) : chooseTarget(ctx, profile, race);
  if (!pick || techCost(state, team, pick) > budget) return [];
  return [{ type: 'queueResearch', teamId, techId: pick.id }];
}
