import { describe, expect, it } from 'vitest';
import {
  TIER_PLAIN,
  TIER_TRANSITION_S,
  advanceTierTransition,
  beginTierTransition,
  makeTierUniforms,
  tierDecl,
  tierOfKind,
} from './shell-tier.js';

describe('shell tiers', () => {
  it('maps materials to tiers', () => {
    expect(tierOfKind(null)).toBe(TIER_PLAIN);
    expect(tierOfKind('chalky')).toBe(0);
    expect(tierOfKind('calcified')).toBe(1);
    expect(tierOfKind('iron')).toBe(2);
    expect(tierOfKind('crystal')).toBe(3);
  });

  it('sweeps over 0.8 s and settles', () => {
    const u = makeTierUniforms(0);
    expect(advanceTierTransition(u, 1)).toBe(false);
    beginTierTransition(u, 2);
    expect([u.from.value, u.to.value, u.progress.value]).toEqual([0, 2, 0]);
    expect(advanceTierTransition(u, TIER_TRANSITION_S / 2)).toBe(true);
    expect(u.progress.value).toBeCloseTo(0.5);
    expect(advanceTierTransition(u, 5)).toBe(false);
    expect(u.progress.value).toBe(1);
  });

  it('ignores a repeated target and restarts on a new one', () => {
    const u = makeTierUniforms(1);
    beginTierTransition(u, 1);
    expect(u.progress.value).toBe(1);
    beginTierTransition(u, 3);
    advanceTierTransition(u, 0.4);
    beginTierTransition(u, 2);
    expect([u.from.value, u.to.value, u.progress.value]).toEqual([3, 2, 0]);
  });

  it('cheap shader drops facets', () => {
    expect(tierDecl(false)).toContain('h21(cell)');
    expect(tierDecl(true)).not.toContain('h21(cell)');
  });
});
