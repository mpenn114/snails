import { createMatch, loadContentPacks, type Command, type MatchSetup } from '@snails/core';
import { basePack } from '@snails/content-base';
import { describe, expect, it } from 'vitest';
import { PERSONALITIES } from '../cpu/types.js';
import { PERSONALITY_PROFILES } from '../cpu/personalities.js';
import { planCpuResearch } from './cpu-research.js';

const r = loadContentPacks([basePack]).registries;

function build(mode: 'elimination' | 'researchRace' = 'elimination', research = true): MatchSetup {
  return createMatch({
    seed: 11,
    teams: [
      { id: 'a', name: 'A', colour: '#e33333' },
      { id: 'b', name: 'B', colour: '#3333ee' },
    ],
    terrain: { nx: 64, ny: 24, nz: 48, caveDensity: 0, islandFalloff: false },
    weapons: r.weapons.list(),
    statuses: r.statuses.list(),
    areas: r.areas.list(),
    crates: r.crates.list(),
    technologies: r.technologies.list(),
    winds: r.winds.list(),
    settings: { snailsPerTeam: 1, research: research ? 'on' : 'off', mode },
  });
}

function fund(m: MatchSetup, calcium: number): void {
  for (const t of m.sim.state.teams) if (t.research) t.research.calcium = calcium;
}
const team = (m: MatchSetup, id = 'a') => m.sim.state.teams.find((t) => t.id === id)!;
const aggressive = PERSONALITY_PROFILES.aggressive;

describe('planCpuResearch', () => {
  it('queues the first build-order tech for each personality when affordable', () => {
    for (const p of PERSONALITIES) {
      const m = build();
      fund(m, 500);
      const profile = PERSONALITY_PROFILES[p];
      const cmds = planCpuResearch(m, 'a', profile, 'veteran');
      expect(cmds).toHaveLength(1);
      expect(cmds[0]).toMatchObject({ type: 'queueResearch', teamId: 'a' });
      const id = (cmds[0] as { techId: string }).techId;
      expect(id.endsWith(profile.buildOrder[0] as string)).toBe(true);
    }
  });

  it('saves up when the best tech is unaffordable, except rookies', () => {
    const m = build();
    fund(m, 5);
    expect(planCpuResearch(m, 'a', aggressive, 'veteran')).toEqual([]);
    fund(m, 21);
    const rookie = planCpuResearch(m, 'a', aggressive, 'rookie');
    expect(rookie).toHaveLength(1);
  });

  it('returns nothing when research is off, there is no state, or the queue is full', () => {
    const off = build('elimination', false);
    expect(planCpuResearch(off, 'a', aggressive, 'veteran')).toEqual([]);
    const m = build();
    fund(m, 500);
    expect(planCpuResearch(m, 'zzz', aggressive, 'veteran')).toEqual([]);
    team(m).research!.queue = ['salt-mining', 'sticky-slime'];
    expect(planCpuResearch(m, 'a', aggressive, 'veteran')).toEqual([]);
  });

  it('counter-picks damage techs when an opponent has iron plating', () => {
    const m = build();
    fund(m, 500);
    const cautious = { ...PERSONALITY_PROFILES.cautious, buildOrder: [] };
    const base = planCpuResearch(m, 'a', cautious, 'veteran');
    team(m, 'b').researched.push('calcified-shell', 'iron-plating');
    const countered = planCpuResearch(m, 'a', cautious, 'veteran');
    const dmg = ['salt-mining', 'sticky-slime', 'heavy-pebbles', 'spiked-whorl'];
    expect(dmg).toContain((countered[0] as { techId: string }).techId);
    expect(base).not.toEqual([]);
  });

  it('is deterministic', () => {
    const m = build();
    fund(m, 500);
    const run = (): Command[] => planCpuResearch(m, 'a', aggressive, 'rookie');
    expect(run()).toEqual(run());
    const other = build();
    fund(other, 500);
    expect(planCpuResearch(other, 'a', aggressive, 'rookie')).toEqual(run());
  });

  it('heads for a capstone in research race mode', () => {
    const m = build('researchRace');
    fund(m, 500);
    const [cmd] = planCpuResearch(m, 'a', aggressive, 'mastermind');
    expect(cmd).toMatchObject({ type: 'queueResearch' });
    expect(r.technologies.get((cmd as { techId: string }).techId)).toBeDefined();
  });

  it('produces commands the sim accepts', () => {
    const m = build();
    fund(m, 500);
    const [cmd] = planCpuResearch(m, 'a', aggressive, 'veteran');
    m.sim.enqueue(cmd as Command);
    const events = m.sim.step();
    expect(events.map((e) => e.type)).toContain('researchQueued');
    const res = team(m).research!;
    const id = (cmd as { techId: string }).techId;
    expect([...res.queue, res.active?.techId, ...team(m).researched]).toContain(id);
  });
});
