import { describe, expect, it } from 'vitest';
import { mayCommandTurn, pickActivePlayer } from './rotation.js';

const all = () => true;

describe('pickActivePlayer', () => {
  it('rotates through the team each turn', () => {
    const seen: (string | undefined)[] = [];
    let c = 0;
    for (let i = 0; i < 4; i++) {
      const p = pickActivePlayer(['a', 'b', 'c'], c, all);
      seen.push(p.playerId);
      c = p.next;
    }
    expect(seen).toEqual(['a', 'b', 'c', 'a']);
  });

  it('skips disconnected players and handles empty or all-offline teams', () => {
    expect(pickActivePlayer(['a', 'b'], 0, (id) => id === 'b')).toEqual({
      playerId: 'b',
      next: 0,
    });
    expect(pickActivePlayer(['a', 'b'], 1, () => false).playerId).toBe('b');
    expect(pickActivePlayer([], 0, all).playerId).toBeUndefined();
  });
});

describe('mayCommandTurn', () => {
  it('perPlayer only lets the designated member command', () => {
    expect(mayCommandTurn('perPlayer', ['a', 'b'], 'a', 'a')).toBe(true);
    expect(mayCommandTurn('perPlayer', ['a', 'b'], 'a', 'b')).toBe(false);
    expect(mayCommandTurn('perPlayer', ['a', 'b'], 'a', 'z')).toBe(false);
  });

  it('hotSeat lets any bound controller command', () => {
    expect(mayCommandTurn('hotSeat', ['a', 'b'], 'a', 'b')).toBe(true);
    expect(mayCommandTurn('hotSeat', ['a'], 'a', 'z')).toBe(false);
  });
});
