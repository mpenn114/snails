import {
  createMatch,
  facingToward,
  Rng,
  type ContentRegistries,
  type MatchSetup,
  type MatchSettingsInput,
  type Snail,
  type Team,
  type WeaponDefinition,
} from '@snails/core';
import { chooseWeapon } from '../weapon-choice.js';
import { BallisticSolverStrategy } from '../strategies.js';
import { BRANCHES, focusBranch, pickTech } from './research-policy.js';
import type { BalanceTiming, MatchRecord } from './stats.js';

/** Options of a headless balance run. */
export interface BalanceOptions {
  registries: ContentRegistries;
  /** Seeds `1..matches` are played. */
  matches: number;
  mode?: 'elimination' | 'researchRace';
  snailsPerTeam?: number;
  /** Hard cap on turns per match (default 60). */
  turnCap?: number;
  settings?: MatchSettingsInput;
}

/** Seconds a typical shot resolves in (for the minutes estimate). */
const RESOLVE_SECONDS = 6;
const TEAMS = [
  { id: 'a', name: 'A', colour: '#e33333' },
  { id: 'b', name: 'B', colour: '#3333ee' },
];

/** Timing of the options, for `aggregate`. */
export function timingOf(o: BalanceOptions): BalanceTiming {
  return {
    turnSeconds: o.settings?.turnTimeSeconds ?? 30,
    retreatSeconds: o.settings?.retreatTimeSeconds ?? 3,
    resolveSeconds: RESOLVE_SECONDS,
  };
}

function flatDistance(a: Snail, b: Snail): number {
  return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
}

function shoot(m: MatchSetup, snail: Snail, weapon: WeaponDefinition, rng: Rng): void {
  const enemies = m.sim.state.teams
    .filter((t) => t.id !== snail.teamId)
    .flatMap((t) => t.snails.filter((s) => s.alive));
  const target = enemies.sort(
    (a, b) => flatDistance(a, snail) - flatDistance(b, snail) || (a.id < b.id ? -1 : 1),
  )[0];
  if (!target) return;
  const shot = new BallisticSolverStrategy().chooseShot({
    origin: { x: 0, y: snail.position.y + 0.5, z: 0 },
    target: { x: flatDistance(target, snail), y: target.position.y, z: 0 },
    wind: 0,
    maxSpeed: weapon.launch?.maxSpeed ?? 20,
  });
  const angle = shot.angle + rng.range(-0.08, 0.08);
  const power = Math.min(1, Math.max(0.1, shot.power + rng.range(-0.08, 0.08)));
  const facing = facingToward(snail.position, target.position);
  m.sim.enqueue({ type: 'aim', snailId: snail.id, angle, power, facing });
  m.sim.enqueue({ type: 'fire', snailId: snail.id, weaponId: weapon.id });
}

function queueResearch(m: MatchSetup, team: Team, seed: number, idx: number): void {
  if (!team.research || team.research.queue.length > 0) return;
  const techs = m.content.technologies.list();
  const def = pickTech(m.sim.state, team, techs, focusBranch(seed, idx));
  if (def) m.sim.enqueue({ type: 'queueResearch', teamId: team.id, techId: def.id });
}

function endReason(m: MatchSetup, turnCap: number): MatchRecord['endReason'] {
  const status = m.sim.state.match;
  if (status.status === 'draw') return 'draw';
  if (status.status !== 'won') return 'turnLimit';
  if (status.reason === 'research') return 'research';
  return m.sim.state.turn.turnNumber >= turnCap ? 'turnLimit' : 'elimination';
}

/** Plays one headless match at `seed` and returns its record. Deterministic per seed. */
export function runBalanceMatch(o: BalanceOptions, seed: number): MatchRecord {
  const turnCap = o.turnCap ?? 60;
  const r = o.registries;
  const m = createMatch({
    seed,
    teams: TEAMS,
    terrain: { nx: 96, ny: 32, nz: 64, caveDensity: 0, islandFalloff: false },
    turn: { maxTurns: turnCap },
    weapons: r.weapons.list(),
    statuses: r.statuses.list(),
    areas: r.areas.list(),
    crates: r.crates.list(),
    technologies: r.technologies.list(),
    winds: r.winds.list(),
    settings: {
      snailsPerTeam: o.snailsPerTeam ?? 2,
      research: 'on',
      mode: o.mode ?? 'elimination',
      ...o.settings,
    },
  });
  const rng = new Rng(seed * 7919 + 1);
  const state = m.sim.state;
  const first = state.turn.activeTeamId as string;
  const weapons = r.weapons.list();
  let handled = -1;
  const maxSteps = (turnCap + 2) * 3000;
  for (let i = 0; i < maxSteps && state.match.status === 'playing'; i++) {
    const t = state.turn;
    if (t.phase === 'action' && t.turnNumber !== handled) {
      handled = t.turnNumber;
      state.teams.forEach((team, idx) => queueResearch(m, team, seed, idx));
      const team = state.teams.find((x) => x.id === t.activeTeamId);
      const snail = team?.snails.find((s) => s.id === t.activeSnailId);
      const weapon = team ? chooseWeapon(team, weapons) : null;
      if (snail && weapon) shoot(m, snail, weapon, rng);
      else m.sim.enqueue({ type: 'endTurn', teamId: t.activeTeamId as string });
    }
    m.sim.step();
  }
  const winner = state.match.status === 'won' ? state.match.winnerTeamId : null;
  return {
    seed,
    turns: state.turn.turnNumber,
    winnerTeamId: winner,
    firstTeamId: first,
    endReason: endReason(m, turnCap),
    teams: state.teams.map((team, idx) => {
      const defs = team.researched.map((id) => m.content.technologies.get(id));
      return {
        teamId: team.id,
        focus: focusBranch(seed, idx),
        researched: [...team.researched],
        branches: defs.map((d) => d?.branch ?? BRANCHES[0]!),
        capstone: defs.find((d) => d?.capstone)?.id ?? null,
      };
    }),
  };
}

/** Runs seeds `1..matches` and returns every record. */
export function runBalance(o: BalanceOptions): MatchRecord[] {
  return Array.from({ length: o.matches }, (_, i) => runBalanceMatch(o, i + 1));
}
