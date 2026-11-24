import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../sim/events.js';
import { ANTI_SNOWBALL, catchUpAmount } from './anti-snowball.js';
import { endTurn, researchMatch, tech } from './research-test-helper.js';
import { techCost } from './tech-rules.js';

function income(events: SimEvent[]): { reason: string; delta: number }[] {
  return events.flatMap((e) =>
    e.type === 'calciumChanged' ? [{ reason: e.reason, delta: e.delta }] : [],
  );
}

describe('catchUpAmount', () => {
  it('scales linearly and is zero at the threshold', () => {
    expect(catchUpAmount(60, 100)).toBe(0);
    expect(catchUpAmount(100, 100)).toBe(0);
    expect(catchUpAmount(30, 100)).toBe(5);
    expect(catchUpAmount(0, 100)).toBe(ANTI_SNOWBALL.catchUpMax);
    expect(catchUpAmount(59, 100)).toBe(1);
  });
});

describe('anti-snowball rules in a match', () => {
  it('grants catchUp Calcium at turn start to the weaker team', () => {
    const m = researchMatch([tech('a')], 'on', 0);
    const weak = m.sim.state.teams.find((t) => t.id !== m.sim.state.turn.activeTeamId)!;
    for (const s of weak.snails) s.health = 1;
    const events = endTurn(m);
    expect(income(events).some((e) => e.reason === 'catchUp' && e.delta > 0)).toBe(true);
  });

  it('halves base income under the Moss Tax after 5 quiet rounds', () => {
    const m = researchMatch([tech('a')], 'on', 0);
    const next = m.sim.state.teams.find((t) => t.id !== m.sim.state.turn.activeTeamId)!;
    next.research!.roundsSinceDamage = ANTI_SNOWBALL.mossTaxRounds;
    const events = endTurn(m);
    expect(income(events).filter((e) => e.reason === 'mossTax')).toEqual([
      { reason: 'mossTax', delta: -7 },
    ]);
    expect(next.research!.calcium).toBe(8);
  });

  it('does not tax a team that recently dealt damage', () => {
    const m = researchMatch([tech('a')], 'on', 0);
    const next = m.sim.state.teams.find((t) => t.id !== m.sim.state.turn.activeTeamId)!;
    next.research!.roundsSinceDamage = 3;
    expect(income(endTurn(m)).some((e) => e.reason === 'mossTax')).toBe(false);
  });

  it('makes techs 5% pricier per owned tech, rounded up', () => {
    const m = researchMatch([tech('a')], 'on');
    const team = m.sim.state.teams[0]!;
    const def = tech('x', { cost: 30 });
    expect(techCost(m.sim.state, team, def)).toBe(30);
    team.researched = ['a'];
    expect(techCost(m.sim.state, team, def)).toBe(32);
    team.researched = ['a', 'b', 'c'];
    expect(techCost(m.sim.state, team, def)).toBe(35);
    m.sim.state.research = 'fast';
    expect(techCost(m.sim.state, team, def)).toBe(18);
  });

  it('keeps kill credit in plain state (survives snapshot restore)', () => {
    const m = researchMatch([tech('a')], 'on', 0);
    const [a, b] = m.sim.state.teams;
    const attacker = a!.snails[0]!;
    const victim = b!.snails[0]!;
    let done = false;
    m.sim.addSystem('test-hit', (ctx) => {
      if (done) return;
      done = true;
      ctx.emit({
        type: 'snailDamaged',
        snailId: victim.id,
        amount: 5,
        remaining: 50,
        sourceSnailId: attacker.id,
        cause: 'explosion',
      });
    });
    m.sim.step();
    const restored = JSON.parse(JSON.stringify(victim)) as typeof victim;
    expect(restored.lastHitByTeam).toBe(a!.id);
  });
});
