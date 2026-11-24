import { describe, expect, it } from 'vitest';
import { createMatch } from '../sim/match.js';
import { testMatchOptions } from '../sim/test-match.js';
import type { SimEvent } from '../sim/events.js';
import { tech } from './research-test-helper.js';

const techs = [tech('plain', { cost: 1 }), tech('cap', { capstone: true, cost: 1 })];

function run(mode: 'elimination' | 'researchRace', give: string) {
  const settings = { mode, research: 'off' } as const;
  const m = createMatch({ ...testMatchOptions(5), technologies: techs, settings });
  const events: SimEvent[] = [];
  m.sim.state.teams[1]!.researched.push(give);
  for (let i = 0; i < 5; i++) events.push(...m.sim.step());
  return { m, events };
}

describe('research race', () => {
  it('forces research on and records capstones', () => {
    const { m } = run('researchRace', 'plain');
    expect(m.sim.state.research).toBe('on');
    expect(m.sim.state.raceCapstones).toEqual(['cap']);
  });
  it('a capstone ends the match with a research reason', () => {
    const { m, events } = run('researchRace', 'cap');
    const id = m.sim.state.teams[1]!.id;
    expect(m.sim.state.match).toMatchObject({
      status: 'won',
      winnerTeamId: id,
      reason: 'research',
    });
    expect(events).toContainEqual({
      type: 'matchEnded',
      status: 'won',
      winnerTeamId: id,
      reason: 'research',
    });
  });
  it('a non-capstone does not end it', () => {
    expect(run('researchRace', 'plain').m.sim.state.match.status).toBe('playing');
  });
  it('elimination mode ignores capstones', () => {
    const { m } = run('elimination', 'cap');
    expect(m.sim.state.raceCapstones).toBeUndefined();
    expect(m.sim.state.match.status).toBe('playing');
  });
  it('elimination still ends a race match', () => {
    const settings = { mode: 'researchRace' } as const;
    const m = createMatch({ ...testMatchOptions(5), technologies: techs, settings });
    for (const s of m.sim.state.teams[0]!.snails) {
      s.alive = false;
      s.health = 0;
    }
    m.sim.enqueue({ type: 'endTurn', teamId: m.sim.state.turn.activeTeamId as string });
    for (let i = 0; i < 6000 && m.sim.state.match.status === 'playing'; i++) m.sim.step();
    expect(m.sim.state.match.status).toBe('won');
    expect(m.sim.state.match.reason).toBeUndefined();
  });
});
