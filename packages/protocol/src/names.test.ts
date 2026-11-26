import { describe, expect, it } from 'vitest';
import { ClientMessage } from './client.js';
import {
  NAME_MAX,
  SNAIL_NAME_POOL,
  TEAM_NAME_POOL,
  nameOr,
  pickNames,
  sanitiseName,
} from './names.js';

describe('names', () => {
  it('cleans whitespace and control characters and limits the length', () => {
    expect(sanitiseName('  Slime \n\t  Squad  ')).toBe('Slime Squad');
    expect(sanitiseName('a'.repeat(40))).toHaveLength(NAME_MAX);
    expect(sanitiseName('\u0000\u0007')).toBe('');
    expect([...sanitiseName('🐌'.repeat(30))]).toHaveLength(NAME_MAX);
  });

  it('keeps markup as text (renderers escape) and falls back when empty', () => {
    expect(sanitiseName('<b>x</b>')).toBe('<b>x</b>');
    expect(nameOr('   ', 'Gary')).toBe('Gary');
    expect(nameOr(' Moss ', 'Gary')).toBe('Moss');
  });

  it('keeps default names within the limit and unique', () => {
    for (const n of [...TEAM_NAME_POOL, ...SNAIL_NAME_POOL])
      expect(n.length).toBeLessThanOrEqual(NAME_MAX);
    expect(new Set(TEAM_NAME_POOL).size).toBe(TEAM_NAME_POOL.length);
    expect(new Set(SNAIL_NAME_POOL).size).toBe(SNAIL_NAME_POOL.length);
  });

  it('picks distinct names, avoiding taken ones, and suffixes when the pool runs dry', () => {
    const names = pickNames(['A', 'B', 'C'], 3, new Set(['b']), () => 0);
    expect(names).toEqual(['A', 'C', 'A 2']);
    expect(new Set(pickNames(SNAIL_NAME_POOL, 8, new Set(), Math.random)).size).toBe(8);
  });

  it('accepts the naming messages', () => {
    expect(ClientMessage.safeParse({ type: 'setTeamName', name: 'x' }).success).toBe(true);
    expect(ClientMessage.safeParse({ type: 'setSnailNames', names: ['a', 'b'] }).success).toBe(
      true,
    );
    expect(
      ClientMessage.safeParse({ type: 'setSnailNames', names: Array(9).fill('a') }).success,
    ).toBe(false);
  });
});
