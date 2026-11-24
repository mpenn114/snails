import { basePack } from '@snails/content-base';
import { createMatch, loadContentPacks, type Command } from '@snails/core';
import type { CpuPlayer } from '@snails/ai';
import { describe, expect, it } from 'vitest';
import { CpuDriver } from './cpu-driver.js';

const registries = loadContentPacks([basePack]).registries;

describe('CpuDriver retreat', () => {
  it('delivers the plan retreat moves once the retreat phase starts', () => {
    const m = createMatch({
      seed: 3,
      teams: [
        { id: 'a', name: 'A', colour: '#e33333' },
        { id: 'b', name: 'B', colour: '#3333ee' },
      ],
      terrain: { nx: 64, ny: 32, nz: 48, caveDensity: 0, islandFalloff: false },
      weapons: registries.weapons.list(),
      settings: { snailsPerTeam: 1 },
    });
    const teamId = 'a';
    const weaponId = registries.weapons.list().find((w) => w.id === 'base:pebble-toss')!.id;
    const cpu: CpuPlayer = {
      config: { difficulty: 'rookie', personality: 'cautious', seed: 1 },
      planResearch: () => [],
      planTurn: (match) => {
        const snailId = match.sim.state.turn.activeSnailId as string;
        const move = (direction: 0 | 1 | -1): Command => ({
          type: 'move',
          snailId,
          direction,
          turn: 0,
        });
        return {
          commands: [
            { atTick: 0, command: { type: 'aim', snailId, angle: 0.8, power: 0.5, facing: 0 } },
            { atTick: 5, command: { type: 'fire', snailId, weaponId } },
          ],
          retreat: [
            { atTick: 0, command: move(1) },
            { atTick: 60, command: move(0) },
          ],
        };
      },
    };
    const driver = new CpuDriver(m, { players: new Map([[teamId, cpu]]), thinkMs: 0 });
    for (let i = 0; i < 400 && m.sim.state.turn.phase !== 'action'; i++) m.sim.step();
    const state = m.sim.state;
    expect(state.turn.activeTeamId).toBe(teamId);
    let start: { x: number; z: number } | null = null;
    let moved = 0;
    for (let i = 0; i < 1500 && state.turn.activeTeamId === teamId; i++) {
      driver.step();
      m.sim.step();
      const s = state.teams[0]!.snails[0]!;
      if (state.turn.phase === 'retreat') {
        start ??= { x: s.position.x, z: s.position.z };
        moved = Math.max(moved, Math.hypot(s.position.x - start.x, s.position.z - start.z));
      }
    }
    expect(start).not.toBeNull();
    expect(moved).toBeGreaterThan(0.5);
  });
});
