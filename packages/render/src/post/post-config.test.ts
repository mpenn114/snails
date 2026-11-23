import { describe, expect, it } from 'vitest';
import { QUALITY_TIERS, tierProfile } from '../quality.js';
import { POST_CONFIGS, postConfigForTier } from './post-config.js';

describe('post config', () => {
  it('high gets the full chain, medium only tone mapping + SMAA, cheap tiers none', () => {
    const high = postConfigForTier('high');
    expect(high?.mode).toBe('full');
    expect(high?.ao).not.toBeNull();
    expect(high?.bloom).not.toBeNull();
    expect(high?.warm).not.toBeNull();
    expect(high?.vignette).not.toBeNull();
    const med = postConfigForTier('medium');
    expect(med).toMatchObject({ mode: 'basic', ao: null, bloom: null, warm: null, vignette: null });
    expect(postConfigForTier('low')).toBeNull();
    expect(postConfigForTier('mobile')).toBeNull();
  });
  it('follows the quality table', () => {
    for (const t of QUALITY_TIERS) {
      const mode = tierProfile(t).post;
      expect(postConfigForTier(t)).toBe(mode === 'none' ? null : POST_CONFIGS[mode]);
    }
  });
  it('keeps the grade mild', () => {
    const full = POST_CONFIGS.full;
    expect(full.bloom?.intensity).toBeLessThanOrEqual(0.4);
    for (const c of full.warm ?? []) expect(Math.abs(c - 1)).toBeLessThanOrEqual(0.1);
    expect(full.vignette?.darkness).toBeLessThanOrEqual(0.5);
  });
});
