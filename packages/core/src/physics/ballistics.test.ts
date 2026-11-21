import { describe, expect, it } from 'vitest';
import { stepProjectile, windAcceleration, GRAVITY } from './ballistics.js';

describe('stepProjectile', () => {
  it('applies gravity and wind', () => {
    const s = stepProjectile(
      { position: { x: 0, y: 10, z: 0 }, velocity: { x: 5, y: 0, z: 0 } },
      { strength: 2, direction: 0 },
      0.5,
    );
    expect(s.velocity.y).toBeCloseTo(-GRAVITY * 0.5);
    expect(s.velocity.x).toBeCloseTo(6);
    expect(s.position.y).toBeLessThan(10);
  });
  it('wind direction uses the snail facing convention (PI/2 is -Z)', () => {
    const a = windAcceleration({ strength: 3, direction: Math.PI / 2 });
    expect(a.x).toBeCloseTo(0);
    expect(a.z).toBeCloseTo(-3);
  });
  it('scales gravity and wind', () => {
    const zero = { x: 0, y: 0, z: 0 };
    const s = stepProjectile(
      { position: zero, velocity: zero, gravityScale: 0, windScale: 0 },
      { strength: 5, direction: 0 },
      1,
    );
    expect(s.velocity.x).toBe(0);
    expect(s.velocity.y).toBe(0);
  });
});
