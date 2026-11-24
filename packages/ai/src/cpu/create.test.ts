import { createMatch, loadContentPacks } from '@snails/core';
import { basePack } from '@snails/content-base';
import { describe, expect, it } from 'vitest';
import { createCpuPlayer } from './create.js';

const registries = loadContentPacks([basePack]).registries;

function match() {
  return createMatch({
    seed: 3,
    teams: [
      { id: 'a', name: 'A', colour: '#e33333' },
      { id: 'b', name: 'B', colour: '#3333ee' },
    ],
    terrain: { nx: 64, ny: 32, nz: 48, caveDensity: 0, islandFalloff: false },
    weapons: registries.weapons.list(),
    settings: { snailsPerTeam: 1 },
  });
}

describe('createCpuPlayer', () => {
  it('plans an aim then a fire for the active snail, deterministically', () => {
    const m = match();
    for (let i = 0; i < 400 && m.sim.state.turn.phase !== 'action'; i++) m.sim.step();
    const teamId = m.sim.state.turn.activeTeamId as string;
    const config = { difficulty: 'regular', personality: 'aggressive', seed: 1 } as const;
    const plan = createCpuPlayer(config).planTurn(m, teamId);
    expect(plan.commands.map((c) => c.command.type)).toEqual(['aim', 'fire']);
    expect(createCpuPlayer(config).planTurn(m, teamId)).toEqual(plan);
    expect(createCpuPlayer(config).planResearch(m, teamId)).toEqual([]);
  });
});
