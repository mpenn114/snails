import { describe, expect, it } from 'vitest';
import { stepProjectile, GRAVITY } from './ballistics.js';

describe('stepProjectile', () => {
  it('applies gravity and wind', () => {
    const s = stepProjectile(
      { position: { x: 0, y: 10, z: 0 }, velocity: { x: 5, y: 0, z: 0 } },
      2,
      0.5,
    );
    expect(s.velocity.y).toBeCloseTo(-GRAVITY * 0.5);
    expect(s.velocity.x).toBeCloseTo(6);
    expect(s.position.y).toBeLessThan(10);
  });
});
