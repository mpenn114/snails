import { basePack } from '@snails/content-base';
import {
  createMatch,
  distance,
  forkMatch,
  loadContentPacks,
  type Command,
  type MatchSetup,
  type Vec3,
} from '@snails/core';
import { describe, expect, it } from 'vitest';
import { createCpuPlayer } from './create.js';
import { DIFFICULTY_PROFILES } from './difficulty.js';
import { planWeaponShots } from './weapon-plan.js';
import { PERSONALITY_PROFILES } from './personalities.js';
import { DIFFICULTIES, type CpuConfig, type Difficulty, type TurnPlan } from './types.js';

const registries = loadContentPacks([basePack]).registries;

function match(seed = 3): MatchSetup {
  const m = createMatch({
    seed,
    teams: [
      { id: 'a', name: 'A', colour: '#e33333' },
      { id: 'b', name: 'B', colour: '#3333ee' },
    ],
    terrain: { nx: 64, ny: 32, nz: 48, caveDensity: 0, islandFalloff: false },
    wind: { maxStrength: 4, minStrength: 2, maxChangePerTurn: 1, mode: 'random' },
    weapons: registries.weapons.list(),
    settings: { snailsPerTeam: 1 },
  });
  for (let i = 0; i < 400 && m.sim.state.turn.phase !== 'action'; i++) m.sim.step();
  return m;
}

function cfg(difficulty: Difficulty, seed = 1): CpuConfig {
  return { difficulty, personality: 'aggressive', seed };
}

/** Drops the enemy `dist` metres from the active snail along +X (or -X near the edge) to rest. */
function placeEnemy(m: MatchSetup, dist: number): Vec3 {
  const { state } = m.sim;
  const me = state.teams.flatMap((t) => t.snails).find((s) => s.id === state.turn.activeSnailId)!;
  const enemy = state.teams.flatMap((t) => t.snails).find((s) => s.teamId !== me.teamId)!;
  const dx = me.position.x + dist < 28 ? dist : -dist;
  enemy.position = { x: me.position.x + dx, y: me.position.y + 6, z: me.position.z };
  for (let i = 0; i < 180; i++) m.sim.step();
  return { ...enemy.position };
}

/** Plays `plan` on a fork and returns where the first projectile ended (null if none flew). */
function impactOf(m: MatchSetup, plan: TurnPlan): Vec3 | null {
  const fork = forkMatch(m);
  const cmds = [...plan.commands];
  let last: Vec3 | null = null;
  for (let t = 0; t < 900 && fork.sim.state.turn.phase !== 'retreat'; t++) {
    while (cmds.length && cmds[0]!.atTick <= t) fork.sim.enqueue(cmds.shift()!.command as Command);
    fork.sim.step();
    const p = fork.sim.state.projectiles[0];
    if (p) last = { ...p.position };
  }
  return last;
}

function hitRate(difficulty: Difficulty, seeds: number): number {
  const m = match();
  const teamId = m.sim.state.turn.activeTeamId as string;
  const target = placeEnemy(m, 18);
  let hits = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const plan = createCpuPlayer(cfg(difficulty, seed)).planTurn(m, teamId);
    const at = impactOf(m, plan);
    if (at && distance(at, target) <= 2) hits++;
  }
  return hits / seeds;
}

describe('difficulty profiles', () => {
  it('get stricter with level', () => {
    const p = DIFFICULTIES.map((d) => DIFFICULTY_PROFILES[d]);
    for (let i = 1; i < p.length; i++) {
      expect(p[i]!.aimNoise.angle).toBeLessThan(p[i - 1]!.aimNoise.angle);
      expect(p[i]!.samples).toBeGreaterThan(p[i - 1]!.samples);
    }
    expect(DIFFICULTY_PROFILES.mastermind.lookahead).toBe(true);
  });
});

describe('CPU turn planner', () => {
  it('has a distinct hit-rate ladder on an 18 m shot', () => {
    const rate = Object.fromEntries(DIFFICULTIES.map((d) => [d, hitRate(d, 20)])) as Record<
      Difficulty,
      number
    >;
    console.log(`hit rate (<=2 m, 20 seeds) ${JSON.stringify(rate)}`);
    expect(rate.rookie).toBeGreaterThanOrEqual(0.05);
    expect(rate.rookie).toBeLessThanOrEqual(0.35);
    expect(rate.regular).toBeGreaterThanOrEqual(0.3);
    expect(rate.regular).toBeLessThanOrEqual(0.65);
    expect(rate.veteran).toBeGreaterThanOrEqual(0.65);
    expect(rate.veteran).toBeLessThanOrEqual(0.95);
    expect(rate.mastermind).toBeGreaterThanOrEqual(0.9);
    expect(rate.rookie).toBeLessThan(rate.regular);
    expect(rate.regular).toBeLessThan(rate.veteran);
    expect(rate.veteran).toBeLessThanOrEqual(rate.mastermind);
  });

  it('plans retreat moves relative to the retreat phase for a cautious CPU', () => {
    const m = match();
    const teamId = m.sim.state.turn.activeTeamId as string;
    placeEnemy(m, 18);
    const plans = [1, 2, 3, 4, 5, 6].map((seed) =>
      createCpuPlayer({ difficulty: 'veteran', personality: 'cautious', seed }).planTurn(m, teamId),
    );
    const withRetreat = plans.filter((p) => p.retreat && p.retreat.length > 0);
    expect(withRetreat.length).toBeGreaterThan(0);
    for (const p of withRetreat) {
      const r = p.retreat!;
      const last = r[r.length - 1]!.command;
      expect(last.type === 'move' && last.direction === 0).toBe(true);
      const ticks = r.map((c) => c.atTick);
      expect(ticks).toEqual([...ticks].sort((x, y) => x - y));
    }
  });

  it('is deterministic and keeps ticks non-decreasing', () => {
    const m = match();
    const teamId = m.sim.state.turn.activeTeamId as string;
    for (const d of DIFFICULTIES) {
      const a = createCpuPlayer(cfg(d)).planTurn(m, teamId);
      const b = createCpuPlayer(cfg(d)).planTurn(m, teamId);
      expect(b).toEqual(a);
      const ticks = a.commands.map((c) => c.atTick);
      expect(ticks).toEqual([...ticks].sort((x, y) => x - y));
      expect(a.commands.some((c) => c.command.type === 'fire')).toBe(true);
    }
  });

  it('rejects a point-blank ranged shot (self risk) and strikes with melee instead', () => {
    const m = match();
    const teamId = m.sim.state.turn.activeTeamId as string;
    placeEnemy(m, 0.7);
    const profile = PERSONALITY_PROFILES.cautious;
    const shots = planWeaponShots(m, teamId, {
      samples: 300,
      weights: { aggression: 1, caution: 1, killBonus: 50 },
      profile,
    });
    const me = m.sim.state.teams[0]!.snails[0]!;
    for (const s of shots) {
      expect(s.kills > 0 || s.selfDamage <= profile.selfRiskTolerance * me.health).toBe(true);
    }
    expect(shots[0]?.melee).toBe(true);
    const plan = createCpuPlayer(cfg('veteran')).planTurn(m, teamId);
    const fire = plan.commands.find((c) => c.command.type === 'fire')?.command;
    expect(fire && 'weaponId' in fire ? fire.weaponId : '').toBe('base:shell-bash');
  });

  it('picks a ranged weapon at long range', () => {
    const m = match();
    const teamId = m.sim.state.turn.activeTeamId as string;
    placeEnemy(m, 20);
    const plan = createCpuPlayer(cfg('veteran')).planTurn(m, teamId);
    const fire = plan.commands.find((c) => c.command.type === 'fire')?.command;
    const id = fire && 'weaponId' in fire ? fire.weaponId : '';
    expect(registries.weapons.get(id)?.melee).toBeUndefined();
  });

  it('logs planTurn time per difficulty', () => {
    const m = match();
    const teamId = m.sim.state.turn.activeTeamId as string;
    placeEnemy(m, 20);
    const times: string[] = [];
    for (const d of DIFFICULTIES) {
      const t0 = performance.now();
      createCpuPlayer(cfg(d)).planTurn(m, teamId);
      times.push(`${d}=${Math.round(performance.now() - t0)}ms`);
    }
    console.log(`planTurn timings: ${times.join(' ')}`);
    expect(times.length).toBe(4);
  });
});
