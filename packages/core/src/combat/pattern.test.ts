import { describe, expect, it } from 'vitest';
import { patternOffsets } from './pattern.js';

describe('patternOffsets', () => {
  it('gives one centred shot without a pattern', () => {
    expect(patternOffsets(undefined, 0.7)).toEqual([{ angle: 0, yaw: 0 }]);
  });

  it('fans evenly and symmetrically across the spread', () => {
    const o = patternOffsets({ count: 5, spread: 0.4 }, 0.1);
    expect(o).toHaveLength(5);
    expect(o.map((x) => x.angle)).toEqual([-0.4, -0.2, 0, 0.2, 0.4].map((v) => expect.closeTo(v)));
    expect(o[2]?.yaw).toBe(0);
  });

  it('scales the spread with power when spreadByPower is set', () => {
    const wide = patternOffsets({ count: 3, spread: 0.4, spreadByPower: true }, 1);
    const narrow = patternOffsets({ count: 3, spread: 0.4, spreadByPower: true }, 0.25);
    expect(wide[2]?.angle).toBeCloseTo(0.4);
    expect(narrow[2]?.angle).toBeCloseTo(0.1);
    expect(patternOffsets({ count: 3, spread: 0.4, spreadByPower: true }, 0)[2]?.angle).toBe(0);
  });
});
