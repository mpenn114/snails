import { describe, expect, it } from 'vitest';
import { FIXED_DT, stepProjectile } from './ballistics.js';
import { computeFalloff } from './explosion.js';
import { MotionSchema, motionStrategies, stepMotion } from './motion.js';

const p = { position: { x: 0, y: 5, z: 0 }, velocity: { x: 3, y: 4, z: 0 } };
const wind = { strength: 2, direction: 0 };

describe('motion strategy table', () => {
  it('has a ballistic strategy that matches stepProjectile', () => {
    expect(Object.keys(motionStrategies)).toContain('ballistic');
    expect(stepMotion(p, wind, FIXED_DT)).toEqual(stepProjectile(p, wind, FIXED_DT));
    const withMotion = stepMotion({ ...p, motion: { kind: 'ballistic' } }, wind, FIXED_DT);
    expect(withMotion.position).toEqual(stepProjectile(p, wind, FIXED_DT).position);
  });
});

describe('bounce and drill motions', () => {
  it('validate their parameters and sit in the table', () => {
    expect(Object.keys(motionStrategies).sort()).toEqual(['ballistic', 'bounce', 'drill']);
    const ok = { kind: 'bounce', restitution: 0.4, friction: 0.2 };
    expect(MotionSchema.safeParse(ok).success).toBe(true);
    expect(MotionSchema.safeParse({ ...ok, restitution: 2 }).success).toBe(false);
    expect(MotionSchema.safeParse({ kind: 'drill', length: 8, tubeRadius: 1 }).success).toBe(false);
  });

  it('bounce steps ballistically and drill flies straight ignoring gravity and wind', () => {
    const bounce = { kind: 'bounce', restitution: 0.4, friction: 0.2 } as const;
    const got = stepMotion({ ...p, motion: bounce }, wind, FIXED_DT);
    const want = stepProjectile(p, wind, FIXED_DT);
    expect(got.position).toEqual(want.position);
    expect(got.velocity).toEqual(want.velocity);
    const drill = { kind: 'drill', length: 8, tubeRadius: 0.8, power: 20 } as const;
    const next = stepMotion({ ...p, motion: drill }, wind, 0.5);
    expect(next.position).toEqual({ x: 1.5, y: 7, z: 0 });
    expect(next.velocity).toEqual(p.velocity);
  });
});

describe('flat falloff', () => {
  it('is 1 everywhere inside the radius and 0 outside', () => {
    expect(computeFalloff(0.7, 1, 'flat')).toBe(1);
    expect(computeFalloff(1, 1, 'flat')).toBe(0);
  });
});
