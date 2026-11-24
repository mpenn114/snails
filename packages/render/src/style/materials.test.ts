import { afterEach, describe, expect, it } from 'vitest';
import {
  bandBrightness,
  createToonMaterial,
  disposeMaterialCache,
  getToonGradient,
  getToonMaterial,
  toonCacheSize,
  toonTierVariant,
} from './materials.js';
import { TOON } from './palette.js';

afterEach(() => disposeMaterialCache());

describe('toon materials', () => {
  it('shares identical materials and separates different ones', () => {
    const a = getToonMaterial({ color: 0xff0000 });
    expect(getToonMaterial({ color: 0xff0000 })).toBe(a);
    expect(getToonMaterial({ color: 0x00ff00 })).not.toBe(a);
    expect(getToonMaterial({ color: 0xff0000, flat: true })).not.toBe(a);
    expect(toonCacheSize()).toBe(3);
  });

  it('create returns fresh instances', () => {
    expect(createToonMaterial({ color: 1 })).not.toBe(createToonMaterial({ color: 1 }));
  });

  it('band config follows TOON constants', () => {
    expect(bandBrightness(0.9, 3)).toBe(TOON.levels[0]);
    expect(bandBrightness(0.5, 3)).toBe(TOON.levels[1]);
    expect(bandBrightness(0.1, 3)).toBe(TOON.levels[2]);
    expect(bandBrightness(0.5, 2)).toBe(TOON.levels[0]);
    expect(bandBrightness(0.1, 2)).toBe(TOON.levels[2]);
    const g = getToonGradient(3);
    expect(getToonGradient(3)).toBe(g);
    expect(getToonGradient(2)).not.toBe(g);
  });

  it('tiers: mobile is cheaper', () => {
    expect(toonTierVariant('high')).toEqual({ bands: 3, rim: true });
    expect(toonTierVariant('mobile')).toEqual({ bands: 2, rim: false });
    const mo = createToonMaterial({ color: 1, rim: 0.4, tier: 'mobile' });
    expect(mo.gradientMap).toBe(getToonGradient(2));
    expect(mo.customProgramCacheKey()).not.toContain('rim');
    const hi = createToonMaterial({ color: 1, rim: 0.4, tier: 'high' });
    expect(hi.customProgramCacheKey()).toContain('rim');
    expect(getToonMaterial({ color: 1, rim: 0.4, tier: 'mobile' })).toBe(
      getToonMaterial({ color: 1, rim: 0.9, tier: 'mobile' }),
    );
  });
});
