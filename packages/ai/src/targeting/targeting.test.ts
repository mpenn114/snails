import {
  createMatch,
  damageAround,
  livingSnails,
  type MatchSetup,
  type SimContext,
  type Snail,
  type WeaponDefinition,
} from '@snails/core';
import { describe, expect, it } from 'vitest';
import { chooseTarget, expectedDamage, rankTargets, scoreImpact } from './index.js';

const BOMB: WeaponDefinition = {
  id: 'test:bomb',
  name: 'Bomb',
  category: 'projectile',
  launch: { minSpeed: 5, maxSpeed: 26, gravityScale: 1, windScale: 1, projectileRadius: 0.1 },
  fuseSeconds: 0,
  effects: [
    { type: 'carve', radius: 2 },
    { type: 'damage', radius: 4, maxDamage: 40, knockback: 6 },
  ],
  ammo: 'infinite',
};

function make(perTeam = 1): MatchSetup {
  const names = (p: string): string[] => Array.from({ length: perTeam }, (_, i) => `${p}${i}`);
  const m = createMatch({
    seed: 5,
    teams: [
      { id: 'a', name: 'A', colour: '#f00', snailNames: names('A') },
      { id: 'b', name: 'B', colour: '#00f', snailNames: names('B') },
    ],
    terrain: { nx: 64, ny: 48, nz: 64, cellSize: 1, caveDensity: 0, islandFalloff: false },
    turn: { introDuration: 0.2, retreatDuration: 0.5, maxTurns: 60 },
    weapons: [BOMB],
  });
  for (let i = 0; i < 400 && m.sim.state.turn.phase !== 'action'; i++) m.sim.step();
  return m;
}

function active(m: MatchSetup): Snail {
  const { state } = m.sim;
  return livingSnails(state).find((s) => s.id === state.turn.activeSnailId) as Snail;
}

describe('targeting', () => {
  it('expected damage matches a real core explosion within 1 HP', () => {
    const m = make();
    const state = structuredClone(m.sim.state);
    const victim = livingSnails(state).find((s) => s.teamId === 'b') as Snail;
    const centre = { x: victim.position.x + 1.7, y: victim.position.y + 0.4, z: victim.position.z };
    const expected = expectedDamage(state, BOMB, centre, victim);
    const before = victim.health;
    const ctx = { state, terrain: m.sim.terrain, emit: () => undefined } as unknown as SimContext;
    const spec = { radius: 4, maxDamage: 40, knockback: 6, falloff: 'linear' } as const;
    damageAround(ctx, centre, spec, { weaponId: BOMB.id, ownerSnailId: 'nobody' });
    expect(Math.abs(before - victim.health - expected)).toBeLessThanOrEqual(1);
    expect(expected).toBeGreaterThan(0);
  });

  it('point-blank self damage scores negative; ally in blast lowers score', () => {
    const m = make(2);
    const { state } = m.sim;
    const me = active(m);
    const enemy = livingSnails(state).find((s) => s.teamId === 'b') as Snail;
    const onSelf = scoreImpact(state, me.teamId, BOMB, me.position);
    expect(onSelf.selfDamage).toBeGreaterThan(0);
    expect(onSelf.score).toBeLessThan(0);
    const clean = scoreImpact(state, me.teamId, BOMB, enemy.position);
    const ally = livingSnails(state).find((s) => s.teamId === me.teamId && s.id !== me.id) as Snail;
    const saved = ally.position;
    ally.position = { ...enemy.position };
    const withAlly = scoreImpact(state, me.teamId, BOMB, enemy.position);
    ally.position = saved;
    expect(withAlly.allyDamage).toBeGreaterThan(0);
    expect(withAlly.score).toBeLessThan(clean.score);
  });

  it('prefers low-health enemies and breaks ties by id', () => {
    const m = make(2);
    const { state } = m.sim;
    const [e0, e1] = livingSnails(state).filter((s) => s.teamId === 'b') as [Snail, Snail];
    expect(rankTargets(state, 'a')[0]?.snailId).toBe([e0.id, e1.id].sort()[0]);
    e1.health = 10;
    expect(rankTargets(state, 'a').map((t) => t.snailId)).toEqual([e1.id, e0.id]);
  });

  it('chooseTarget returns an enemy deterministically without mutating the match', () => {
    const m = make(2);
    const teamId = m.sim.state.turn.activeTeamId as string;
    const snapshot = JSON.stringify(m.sim.state);
    const a = chooseTarget(m, teamId, BOMB, 60);
    const b = chooseTarget(m, teamId, BOMB, 60);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    const target = livingSnails(m.sim.state).find((s) => s.id === a?.targetId);
    expect(target?.teamId).not.toBe(teamId);
    expect(JSON.stringify(m.sim.state)).toBe(snapshot);
  });
});
