import { describe, expect, it } from 'vitest';
import { activeScreenFacing } from './facing-tracker';

describe('activeScreenFacing', () => {
  const snails = [
    ['a', 0, 0, 0, 0, 0, 0, 0],
    ['b', 0, 0, 0, 0, 0, 0, 3142],
  ] as const;
  it('projects the world facing for the camera', () => {
    expect(activeScreenFacing(snails, 'a').x).toBeCloseTo(1);
    expect(activeScreenFacing(snails, 'b').x).toBeCloseTo(-1);
    expect(activeScreenFacing(snails, 'a', 0).y).toBeCloseTo(1);
  });
  it('defaults to side view facing right without an active snail', () => {
    expect(activeScreenFacing(snails, null)).toEqual({ x: 1, y: 0 });
    expect(activeScreenFacing(snails, 'zzz')).toEqual({ x: 1, y: 0 });
  });
});
