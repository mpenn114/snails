import { describe, expect, it } from 'vitest';
import { guidedWeaponIds, hasGuidedProjectile, stickToSteer } from './steering';

describe('stickToSteer', () => {
  it('is zero inside the dead zone and +-1 at full deflection', () => {
    expect(stickToSteer(5, 60)).toBe(0);
    expect(stickToSteer(-9, 60)).toBe(0);
    expect(stickToSteer(60, 60)).toBe(1);
    expect(stickToSteer(-200, 60)).toBe(-1);
  });
  it('ramps linearly and keeps the sign', () => {
    expect(stickToSteer(35, 60)).toBeCloseTo(0.5, 6);
    expect(stickToSteer(-35, 60)).toBeCloseTo(-0.5, 6);
  });
  it('guards a degenerate radius', () => {
    expect(stickToSteer(50, 0)).toBe(0);
  });
});

describe('guided projectile detection', () => {
  const guided = guidedWeaponIds([
    { id: 'base:pebble-toss' },
    { id: 'base:radula-missile', motion: { kind: 'guided' } },
  ]);
  it('finds only guided weapons', () => {
    expect([...guided]).toEqual(['base:radula-missile']);
  });
  it('is true only while a guided projectile is in the snapshot', () => {
    expect(hasGuidedProjectile([['p1', 'base:pebble-toss', 0]], guided)).toBe(false);
    expect(hasGuidedProjectile([['p2', 'base:radula-missile', 0]], guided)).toBe(true);
    expect(hasGuidedProjectile([], guided)).toBe(false);
  });
});
