import { describe, expect, it } from 'vitest';
import { motionConfig, resolveReducedMotion } from './motion.js';

describe('reduced motion', () => {
  it('falls back to the media query', () => {
    expect(resolveReducedMotion('', true)).toBe(true);
    expect(resolveReducedMotion('?x=1', false)).toBe(false);
  });
  it('lets the URL param override', () => {
    expect(resolveReducedMotion('?reducedMotion=1', false)).toBe(true);
    expect(resolveReducedMotion('?reducedMotion=true', false)).toBe(true);
    expect(resolveReducedMotion('?reducedMotion=0', true)).toBe(false);
  });
  it('disables shake and slows pans when reduced', () => {
    expect(motionConfig(true)).toEqual({ reduced: true, shakeScale: 0, panSlowdown: 2.5 });
    expect(motionConfig(false).shakeScale).toBe(1);
  });
});
