import { describe, expect, it } from 'vitest';
import {
  EventBatch,
  Snapshot,
  decodeEventBatch,
  decodeSnapshot,
  deltaDecode,
  deltaEncode,
  encodeEventBatch,
  encodeSnapshot,
  parseServerMessage,
  type DecodedSnapshot,
  type SimEventData,
} from './index.js';

function makeSnapshot(count: number): DecodedSnapshot {
  return {
    tick: 1234,
    wind: { strength: 1.5, direction: 2.25 },
    turn: {
      activeTeamId: 'red',
      activeSnailId: 'red-0',
      phase: 'action',
      timeRemaining: 17.234,
      turnNumber: 3,
    },
    snails: Array.from({ length: count }, (_, i) => ({
      id: `snail-${i}`,
      position: { x: 10.123456 + i, y: 8.987654, z: 20.5551 - i },
      velocity: { x: 0.1234567, y: -3.9876543, z: 0 },
      facing: 1.2345678,
      health: 100 - i,
      state: i % 2 ? 'airborne' : 'grounded',
      aim: { angle: 0.7853981, power: 0.6543 },
    })),
    projectiles: [
      {
        id: 'p1',
        weaponId: 'bazooka',
        position: { x: 1.0004, y: 2.0006, z: 3 },
        velocity: { x: 10, y: 5, z: -2 },
      },
    ],
    statuses: [{ snailId: 'snail-0', statusId: 'base:salt', turnsLeft: 2, magnitude: 1.5 }],
    areas: [
      {
        id: 'a1',
        kind: 'base:spore-cloud',
        position: { x: 4.0004, y: 5, z: 6 },
        radius: 3.5,
        turnsLeft: 3,
      },
    ],
    scheduled: [
      {
        id: 's1',
        groupId: 'g1',
        position: { x: 7.5, y: 5, z: 6 },
        radius: 2.5,
        turnsLeft: 2,
        style: 'strike',
      },
      {
        id: 's2',
        groupId: 'g2',
        position: { x: 9, y: 5, z: 6 },
        radius: 0.9,
        turnsLeft: 1,
        style: 'arrival',
      },
    ],
  };
}

describe('snapshot encoding', () => {
  it('round-trips within millimetre precision', () => {
    const s = makeSnapshot(16);
    const wire = Snapshot.parse(JSON.parse(JSON.stringify(encodeSnapshot(s))));
    const d = decodeSnapshot(wire);
    expect(d.tick).toBe(s.tick);
    expect(d.turn.phase).toBe('action');
    expect(d.turn.activeSnailId).toBe('red-0');
    expect(d.snails).toHaveLength(16);
    expect(d.snails[1]?.state).toBe('airborne');
    expect(d.snails[3]?.health).toBe(97);
    expect(d.snails[0]?.position.x).toBeCloseTo(10.123456, 3);
    expect(d.snails[0]?.facing).toBeCloseTo(1.2345678, 3);
    expect(d.projectiles[0]?.position.x).toBeCloseTo(1.0004, 3);
    expect(d.wind.strength).toBeCloseTo(1.5, 3);
    expect(d.statuses).toEqual(s.statuses);
    expect(d.scheduled).toEqual(s.scheduled);
    expect(d.areas[0]?.position.x).toBeCloseTo(4.0004, 3);
    expect(d.areas[0]).toMatchObject({
      id: 'a1',
      kind: 'base:spore-cloud',
      turnsLeft: 3,
      radius: 3.5,
    });
    expect(parseServerMessage(wire).type).toBe('snapshot');
  });
  it('is smaller than naive JSON for 16 snails', () => {
    const s = makeSnapshot(16);
    const compact = JSON.stringify(encodeSnapshot(s)).length;
    const naive = JSON.stringify({ type: 'snapshot', ...s }).length;
    expect(compact).toBeLessThan(naive * 0.7);
  });
});

describe('event batch encoding', () => {
  const events: SimEventData[] = [
    { type: 'explosion', position: { x: 1, y: 2, z: 3 }, radius: 2, weaponId: 'bazooka' },
    {
      type: 'terrainCarved',
      centre: { x: 1, y: 2, z: 3 },
      radius: 2,
      chunks: [3, 4, 9, 100],
    },
    {
      type: 'terrainCollapsed',
      chunks: [4, 5],
      removedCells: 12,
      fallen: [],
      cellIndices: [10, 11, 15, 1000],
      cellValues: [0.5, -0.25, 1, 2.125],
    },
    { type: 'matchEnded', status: 'won', winnerTeamId: 'red' },
  ];
  it('round-trips and delta-encodes id lists', () => {
    const batch = encodeEventBatch(50, events);
    const wire = EventBatch.parse(JSON.parse(JSON.stringify(batch)));
    expect(decodeEventBatch(wire)).toEqual(events);
    expect(batch.events[1]).toMatchObject({ chunkDeltas: [3, 1, 5, 91] });
    expect(parseServerMessage(wire).type).toBe('eventBatch');
  });
  it('delta helpers invert each other and handle empty lists', () => {
    expect(deltaDecode(deltaEncode([2, 5, 5, 40]))).toEqual([2, 5, 5, 40]);
    expect(deltaEncode([])).toEqual([]);
  });
});
