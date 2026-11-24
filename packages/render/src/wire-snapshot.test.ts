import { describe, expect, it } from 'vitest';
import type { DecodedSnapshot } from '@snails/protocol';
import { WireSnapshotMapper } from './wire-snapshot.js';

const info = {
  seed: 7,
  terrain: { nx: 8, ny: 8, nz: 8, cellSize: 0.5, waterLevel: 1 },
  teams: [
    {
      id: 't1',
      name: 'Red',
      colour: '#f00',
      snails: [
        { id: 's1', name: 'Sam' },
        { id: 's2', name: 'Gus' },
      ],
    },
  ],
};

function snap(
  tick: number,
  health: number,
  state: 'grounded' | 'dead' = 'grounded',
): DecodedSnapshot {
  return {
    tick,
    wind: { strength: 1, direction: 2 },
    turn: {
      activeTeamId: 't1',
      activeSnailId: 's1',
      phase: 'fire',
      timeRemaining: 5,
      turnNumber: 2,
    },
    snails: [
      {
        id: 's1',
        position: { x: 1, y: 2, z: 3 },
        velocity: { x: 0, y: 0, z: 0 },
        facing: 0.5,
        health,
        state,
        aim: { angle: 0.1, power: 0.5 },
      },
    ],
    projectiles: [
      { id: 'p1', weaponId: 'w', position: { x: 0, y: 1, z: 0 }, velocity: { x: 1, y: 0, z: 0 } },
    ],
    statuses: [{ snailId: 's1', statusId: 'base:salt', turnsLeft: 2, magnitude: 1 }],
    areas: [
      { id: 'a1', kind: 'base:cloud', position: { x: 1, y: 2, z: 3 }, radius: 2, turnsLeft: 3 },
    ],
    scheduled: [
      {
        id: 's1',
        groupId: 'g1',
        position: { x: 4, y: 2, z: 3 },
        radius: 2,
        turnsLeft: 2,
        style: 'strike',
      },
    ],
  };
}

describe('WireSnapshotMapper', () => {
  it('maps roster, positions and turn', () => {
    const m = new WireSnapshotMapper(info).map(snap(3, 80));
    expect(m.tick).toBe(3);
    expect(m.seed).toBe(7);
    expect(m.teams[0]?.snails).toHaveLength(1);
    const s = m.teams[0]?.snails[0];
    expect(s?.name).toBe('Sam');
    expect(s?.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(s?.alive).toBe(true);
    expect(s?.grounded).toBe(true);
    expect(s?.shell.colour).toBe('#f00');
    expect(m.scheduled[0]?.telegraph).toEqual({ radius: 2, style: 'strike' });
    expect(m.turn.fired).toBe(true);
    expect(m.projectiles[0]?.ownerSnailId).toBe('s1');
    expect(s?.statuses?.[0]).toMatchObject({ id: 'base:salt', turnsLeft: 2 });
    expect(m.areas[0]).toMatchObject({ id: 'a1', kind: 'base:cloud', radius: 2 });
  });

  it('tracks max health and marks dead snails', () => {
    const mapper = new WireSnapshotMapper(info);
    mapper.map(snap(1, 150));
    const s = mapper.map(snap(2, 0, 'dead')).teams[0]?.snails[0];
    expect(s?.maxHealth).toBe(150);
    expect(s?.alive).toBe(false);
  });
});
