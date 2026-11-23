import { describe, expect, it } from 'vitest';
import { activeFacingSign } from './facing-tracker';

describe('activeFacingSign', () => {
  const snails = [
    ['a', 0, 0, 0, 0, 0, 0, 0],
    ['b', 0, 0, 0, 0, 0, 0, 3142],
  ] as const;
  it('maps world facing to a screen sign', () => {
    expect(activeFacingSign(snails, 'a')).toBe(1);
    expect(activeFacingSign(snails, 'b')).toBe(-1);
    expect(activeFacingSign(snails, 'b', Math.PI)).toBe(1);
  });
  it('defaults to +1 without an active snail', () => {
    expect(activeFacingSign(snails, null)).toBe(1);
    expect(activeFacingSign(snails, 'zzz')).toBe(1);
  });
});
