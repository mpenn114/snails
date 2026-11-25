import { describe, expect, it } from 'vitest';
import { crackStateFor, damageForRatio, easeDamage } from './crack-damage.js';

describe('crackStateFor', () => {
  it('maps ratio bands to states', () => {
    expect(crackStateFor(1)).toBe('pristine');
    expect(crackStateFor(0.76)).toBe('pristine');
    expect(crackStateFor(0.75)).toBe('scratched');
    expect(crackStateFor(0.51)).toBe('scratched');
    expect(crackStateFor(0.5)).toBe('cracked');
    expect(crackStateFor(0.26)).toBe('cracked');
    expect(crackStateFor(0.25)).toBe('critical');
    expect(crackStateFor(0.01)).toBe('critical');
    expect(crackStateFor(-1)).toBe('critical');
    expect(crackStateFor(5)).toBe('pristine');
  });
});

describe('damage easing', () => {
  it('derives damage from the ratio, clamped', () => {
    expect(damageForRatio(1)).toBe(0);
    expect(damageForRatio(0.25)).toBeCloseTo(0.75);
    expect(damageForRatio(2)).toBe(0);
    expect(damageForRatio(-1)).toBe(1);
    expect(damageForRatio(NaN)).toBe(0);
  });
  it('grows gradually and settles in about half a second', () => {
    let d = easeDamage(0, 1, 0.05);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(0.5);
    for (let i = 0; i < 20; i++) d = easeDamage(d, 1, 0.05);
    expect(d).toBe(1);
    expect(easeDamage(0.3, 0.8, 0)).toBe(0.3);
  });
  it('eases back down when the health ratio rises', () => {
    expect(easeDamage(0.8, 0.2, 0.1)).toBeLessThan(0.8);
  });
});
