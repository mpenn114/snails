import { describe, expect, it } from 'vitest';
import {
  DEAD_MIN_DAMAGE,
  DEATH_DURATION,
  DeathTracker,
  FLOAT_BOB,
  deadShellDamage,
  deathPose,
  drownFloat,
  isDrowned,
} from './death-sequence.js';

describe('DeathTracker', () => {
  it('stays alive while alive', () => {
    const t = new DeathTracker();
    expect(t.update(true, 0.1)).toEqual({ phase: 'alive', progress: 0, justDied: false });
    expect(t.update(true, 0.1).phase).toBe('alive');
  });

  it('plays the sequence on alive to dead and reports justDied once', () => {
    const t = new DeathTracker();
    t.update(true, 0.1);
    const a = t.update(false, 0.2);
    expect(a.phase).toBe('dying');
    expect(a.justDied).toBe(true);
    expect(a.progress).toBeCloseTo(0.2 / DEATH_DURATION);
    const b = t.update(false, 0.2);
    expect(b.justDied).toBe(false);
    expect(b.progress).toBeCloseTo(0.5);
    const c = t.update(false, 5);
    expect(c).toEqual({ phase: 'dead', progress: 1, justDied: false });
  });

  it('shows the final state with no animation when first seen dead', () => {
    const t = new DeathTracker();
    expect(t.update(false, 0)).toEqual({ phase: 'dead', progress: 1, justDied: false });
  });

  it('resets when revived', () => {
    const t = new DeathTracker();
    t.update(true, 0);
    t.update(false, 0.1);
    expect(t.update(true, 0.1).phase).toBe('alive');
  });
});

describe('deathPose', () => {
  it('shows X eyes early and the body gone at the end', () => {
    expect(deathPose(0.1).xEyes).toBe(true);
    expect(deathPose(0.1).bodyScale).toBe(1);
    expect(deathPose(0.7).xEyes).toBe(false);
    expect(deathPose(1)).toEqual({ bodyScale: 0, slide: expect.any(Number), xEyes: false });
    expect(deathPose(0.6).bodyScale).toBeLessThan(1);
  });
});

describe('dead shell and drowning', () => {
  it('forces at least cracked damage', () => {
    expect(deadShellDamage(0)).toBe(DEAD_MIN_DAMAGE);
    expect(deadShellDamage(0.9)).toBe(0.9);
  });

  it('floats at the surface and bobs within bounds', () => {
    const o = drownFloat(-1, 0, 0, 0);
    expect(o.y).toBeCloseTo(0.95);
    for (let t = 0; t < 10; t += 0.3) {
      const f = drownFloat(-1, 0, t, 0.3);
      expect(Math.abs(f.y - 0.95)).toBeLessThanOrEqual(FLOAT_BOB + 1e-9);
    }
    expect(drownFloat(2, 0, 0).y).toBeCloseTo(0);
  });

  it('detects drowning from the flag or position', () => {
    expect(isDrowned(true, 5, 0)).toBe(true);
    expect(isDrowned(false, -1, 0)).toBe(true);
    expect(isDrowned(false, 1, 0)).toBe(false);
    expect(isDrowned(false, -1, null)).toBe(false);
  });
});
