import { describe, expect, it } from 'vitest';
import { FIXED_DT, stepProjectile } from './ballistics.js';
import { motionStrategies, stepMotion } from './motion.js';

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
