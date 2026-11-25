import { describe, expect, it } from 'vitest';
import { createMatch, type MatchSetup, type Snail } from '@snails/core';
import { planMovement, planRetreat, simulateMoves } from './index.js';

function actionMatch(seed = 7): MatchSetup {
  const m = createMatch({
    seed,
    teams: [
      { id: 'a', name: 'A', colour: '#f00', snailNames: ['A1'] },
      { id: 'b', name: 'B', colour: '#00f', snailNames: ['B1'] },
    ],
    terrain: { nx: 64, ny: 32, nz: 64, caveDensity: 0, islandFalloff: false, baseHeight: 8 },
    turn: { introDuration: 0.5, retreatDuration: 0.5, maxTurns: 60 },
    weapons: [],
  });
  for (let i = 0; i < 200 && m.sim.state.turn.phase !== 'action'; i++) m.sim.step();
  return m;
}

function active(m: MatchSetup): Snail {
  const id = m.sim.state.turn.activeSnailId;
  const s = m.sim.state.teams.flatMap((t) => t.snails).find((x) => x.id === id);
  if (!s) throw new Error('no active snail');
  return s;
}

describe('movement planning', () => {
  it('does not mutate the input and its prediction matches a real application', () => {
    const m = actionMatch();
    const snap = JSON.stringify(m.sim.snapshot());
    const plan = planMovement(m, active(m).teamId, { candidates: 16, maxTicks: 60 });
    expect(JSON.stringify(m.sim.snapshot())).toBe(snap);
    const predicted = simulateMoves(m, active(m).id, plan.commands, 120);
    expect(predicted.position).toEqual(plan.end);
    for (let t = 0; t < 120; t++) {
      for (const c of plan.commands) if (c.atTick === t) m.sim.enqueue(c.command);
      m.sim.step();
    }
    expect(active(m).position).toEqual(predicted.position);
    if (plan.commands.length) {
      expect(plan.commands.at(-1)?.command).toMatchObject({ type: 'move', direction: 0 });
    }
  });

  it('stays put when every candidate is unsafe (water everywhere)', () => {
    const m = actionMatch();
    const s = active(m);
    m.sim.state.terrain.waterLevel = s.position.y + 20;
    const plan = planMovement(m, s.teamId, { candidates: 16, maxTicks: 60 });
    expect(plan.commands).toEqual([]);
    expect(plan.end).toEqual(s.position);
    expect(planRetreat(m, s.teamId, 60).commands).toEqual([]);
  });

  it('never picks a script that drowns or loses health', () => {
    const m = actionMatch();
    const s = active(m);
    m.sim.state.terrain.waterLevel = s.position.y - 1;
    const plan = planMovement(m, s.teamId, { candidates: 24, maxTicks: 90 });
    const out = simulateMoves(m, s.id, plan.commands, 200);
    expect(out.alive).toBe(true);
    expect(out.health).toBeGreaterThanOrEqual(s.health);
  });

  it('retreat does not get closer to the enemy', () => {
    const m = actionMatch();
    const s = active(m);
    const enemy = m.sim.state.teams.find((t) => t.id !== s.teamId)!.snails[0]!;
    const plan = planRetreat(m, s.teamId, 60);
    const d = (p: { x: number; z: number }): number =>
      Math.hypot(p.x - enemy.position.x, p.z - enemy.position.z);
    expect(d(plan.end)).toBeGreaterThanOrEqual(d(s.position) - 0.5);
  });

  it('reports timing', () => {
    const m = actionMatch();
    const t0 = performance.now();
    planMovement(m, active(m).teamId, { candidates: 16, maxTicks: 120 });
    console.log(`planMovement 16x120: ${(performance.now() - t0).toFixed(0)} ms`);
  });
});
