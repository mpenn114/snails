import { describe, expect, it } from 'vitest';
import { TurnManager } from './turn-manager.js';
import type { Team } from '../state/types.js';

const snail = (id: string, teamId: string, health = 100) => ({
  id,
  teamId,
  name: id,
  position: { x: 0, y: 0, z: 0 },
  health,
  maxHealth: 100,
  shell: { upgradeId: null, colour: '#fff' },
});
const team = (id: string, snails: Team['snails']): Team => ({
  id,
  name: id,
  colour: '#fff',
  snails,
  researched: [],
});

describe('TurnManager', () => {
  it('cycles teams and snails, skipping dead', () => {
    const tm = new TurnManager([
      team('A', [snail('a1', 'A'), snail('a2', 'A', 0), snail('a3', 'A')]),
      team('B', [snail('b1', 'B')]),
    ]);
    const order = Array.from({ length: 5 }, () => tm.next()?.snail.id);
    expect(order).toEqual(['a1', 'b1', 'a3', 'b1', 'a1']);
  });
  it('returns null when all dead and expires timer', () => {
    expect(new TurnManager([team('A', [snail('a', 'A', 0)])]).next()).toBeNull();
    const tm = new TurnManager([team('A', [snail('a', 'A')])], 100);
    tm.next();
    expect(tm.tick(60)).toBe(false);
    expect(tm.tick(60)).toBe(true);
  });
});
