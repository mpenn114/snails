import { describe, expect, it } from 'vitest';
import { cloneState, createInitialState, createSnapshot } from './game-state.js';

const make = () =>
  createInitialState({
    seed: 7,
    terrain: { nx: 4, ny: 4, nz: 4 },
    teams: [
      { id: 'a', name: 'A', colour: '#f00', snails: [{ id: 'a1', name: 'x' }] },
      { id: 'b', name: 'B', colour: '#00f', snails: [{ id: 'b1', name: 'y' }] },
    ],
  });

describe('game state', () => {
  it('builds initial state', () => {
    const s = make();
    expect(s.tick).toBe(0);
    expect(s.turn.activeSnailId).toBe('a1');
    expect(s.teams[1]?.snails[0]?.alive).toBe(true);
  });
  it('snapshot round-trips through JSON', () => {
    const snap = createSnapshot(make());
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });
  it('clone is independent', () => {
    const s = make();
    const c = cloneState(s);
    expect(c).toEqual(s);
    const snail = c.teams[0]?.snails[0];
    if (snail) snail.position.x = 9;
    c.projectiles.push({
      id: 'p',
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      ownerSnailId: 'a1',
      weaponId: 'w',
      radius: 0.1,
      age: 0,
      maxAge: 10,
      gravityScale: 1,
      windScale: 1,
    });
    expect(s.teams[0]?.snails[0]?.position.x).toBe(0);
    expect(s.projectiles).toHaveLength(0);
  });
});
