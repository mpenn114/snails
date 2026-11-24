import { createMatch, type MatchSetup, type SimEvent } from '@snails/core';
import { createCpuPlayer } from '../cpu/create.js';
import type { CpuPlayer, PlannedCommand } from '../cpu/types.js';
import type { AiEndReason, AiErrorRecord, AiMatchOptions, AiMatchRecord } from './types.js';

const TEAM_IDS = ['a', 'b', 'c', 'd'];
const COLOURS = ['#e33333', '#3333ee', '#33aa33', '#ddaa22'];
/** Ticks without progress after the plan is exhausted before the turn is ended by force. */
const STALL_TICKS = 90;

/** Mutable bookkeeping of one running match. */
interface Run {
  m: MatchSetup;
  cpus: CpuPlayer[];
  record: AiMatchRecord;
  teamOf: Map<string, number>;
  lastHitBy: Map<string, number>;
  pending: PlannedCommand[];
  planStart: number;
  lastActivity: number;
  fired: boolean;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fail(r: Run, teamIndex: number, where: AiErrorRecord['where'], text: string): void {
  r.record.errors.push({ turn: r.m.sim.state.turn.turnNumber, teamIndex, where, message: text });
}

function endTurn(r: Run, teamIndex: number): void {
  const teamId = r.m.sim.state.teams[teamIndex]?.id;
  if (teamId) r.m.sim.enqueue({ type: 'endTurn', teamId });
}

function observe(r: Run, e: SimEvent): void {
  const teams = r.record.teams;
  if (e.type === 'projectileFired') {
    const t = r.teamOf.get(e.snailId);
    if (t !== undefined) (teams[t] as { shotsFired: number }).shotsFired += 1;
    r.fired = true;
  } else if (e.type === 'snailDamaged' && e.sourceSnailId) {
    const src = r.teamOf.get(e.sourceSnailId);
    const dst = r.teamOf.get(e.snailId);
    if (src === undefined || src === dst) return;
    (teams[src] as { damageDealt: number }).damageDealt += e.amount;
    r.lastHitBy.set(e.snailId, src);
  } else if (e.type === 'snailDied') {
    const killer = r.lastHitBy.get(e.snailId);
    if (killer !== undefined) (teams[killer] as { kills: number }).kills += 1;
  } else if (e.type === 'researchCompleted') {
    const idx = r.m.sim.state.teams.findIndex((t) => t.id === e.teamId);
    teams[idx]?.techsResearched.push(e.techId);
  }
}

function startTurn(r: Run): void {
  const state = r.m.sim.state;
  r.fired = false;
  r.pending = [];
  r.planStart = state.tick;
  r.lastActivity = state.tick;
  state.teams.forEach((team, i) => {
    try {
      for (const c of (r.cpus[i] as CpuPlayer).planResearch(r.m, team.id)) r.m.sim.enqueue(c);
    } catch (e) {
      fail(r, i, 'planResearch', message(e));
    }
  });
  const active = state.teams.findIndex((t) => t.id === state.turn.activeTeamId);
  if (active < 0) return;
  const t0 = performance.now();
  try {
    const plan = (r.cpus[active] as CpuPlayer).planTurn(r.m, state.teams[active]!.id);
    r.pending = [...plan.commands];
    r.record.teams[active]?.planWork.push(plan.work ?? 0);
  } catch (e) {
    fail(r, active, 'planTurn', message(e));
    endTurn(r, active);
  }
  r.record.teams[active]?.planTimesMs.push(performance.now() - t0);
}

function deliver(r: Run): void {
  const state = r.m.sim.state;
  while (
    r.pending.length > 0 &&
    (r.pending[0] as PlannedCommand).atTick <= state.tick - r.planStart
  ) {
    r.m.sim.enqueue((r.pending.shift() as PlannedCommand).command);
    r.lastActivity = state.tick;
  }
  const active = state.teams.findIndex((t) => t.id === state.turn.activeTeamId);
  if (r.pending.length === 0 && !r.fired && state.tick - r.lastActivity > STALL_TICKS) {
    fail(r, active, 'stall', 'no fire or endTurn within the turn');
    endTurn(r, active);
    r.lastActivity = state.tick;
  }
}

function endReason(m: MatchSetup): AiEndReason {
  const status = m.sim.state.match;
  if (status.status === 'draw') return 'draw';
  if (status.status !== 'won') return 'turnLimit';
  if (status.reason === 'research') return 'research';
  return 'elimination';
}

function build(o: AiMatchOptions, turnCap: number): Run {
  const r = o.registries;
  const m = createMatch({
    seed: o.seed,
    teams: o.teams.map((_, i) => ({
      id: TEAM_IDS[i] as string,
      name: (TEAM_IDS[i] as string).toUpperCase(),
      colour: COLOURS[i] as string,
    })),
    terrain: { nx: 96, ny: 32, nz: 64, caveDensity: 0, islandFalloff: false },
    turn: { maxTurns: turnCap },
    weapons: r.weapons.list(),
    statuses: r.statuses.list(),
    areas: r.areas.list(),
    crates: r.crates.list(),
    technologies: r.technologies.list(),
    winds: r.winds.list(),
    settings: { snailsPerTeam: o.snailsPerTeam ?? 2, research: 'on', ...o.settings },
  });
  const teamOf = new Map<string, number>();
  m.sim.state.teams.forEach((t, i) => t.snails.forEach((s) => teamOf.set(s.id, i)));
  return {
    m,
    teamOf,
    lastHitBy: new Map(),
    pending: [],
    planStart: 0,
    lastActivity: 0,
    fired: false,
    cpus: o.teams.map((t, i) => createCpuPlayer({ ...t, seed: o.seed * 31 + i })),
    record: {
      seed: o.seed,
      winner: null,
      winnerConfig: null,
      turns: 0,
      endReason: 'turnLimit',
      errors: [],
      teams: o.teams.map((t, i) => ({
        ...t,
        index: i,
        teamId: TEAM_IDS[i] as string,
        shotsFired: 0,
        damageDealt: 0,
        kills: 0,
        techsResearched: [],
        planTimesMs: [],
        planWork: [],
      })),
    },
  };
}

/**
 * Plays one headless CPU-vs-CPU match at `o.seed`. Deterministic apart from the wall-clock
 * `planTimesMs`. CPU exceptions and stalled turns are recorded in `errors` and the turn is ended.
 */
export function runAiMatch(o: AiMatchOptions): AiMatchRecord {
  if (o.teams.length < 2 || o.teams.length > 4) throw new Error('an AI match needs 2-4 teams');
  const turnCap = o.turnCap ?? 60;
  const r = build(o, turnCap);
  const state = r.m.sim.state;
  let handled = -1;
  const maxSteps = (turnCap + 2) * 4000;
  for (let i = 0; i < maxSteps && state.match.status === 'playing'; i++) {
    const t = state.turn;
    if (t.turnNumber > turnCap) break;
    if (t.phase === 'action' && t.turnNumber !== handled) {
      handled = t.turnNumber;
      startTurn(r);
    }
    if (t.phase === 'action') deliver(r);
    for (const e of r.m.sim.step()) observe(r, e);
  }
  const rec = r.record;
  rec.turns = state.turn.turnNumber;
  rec.endReason = endReason(r.m);
  if (state.match.status === 'won') {
    const w = state.teams.findIndex((t) => t.id === state.match.winnerTeamId);
    rec.winner = w >= 0 ? w : null;
    rec.winnerConfig = w >= 0 ? o.teams[w]! : null;
  }
  return rec;
}
