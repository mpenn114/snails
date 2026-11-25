import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ShellDebris, crossingFragmentCount, hitFragmentCount } from './shell-debris.js';

describe('crossingFragmentCount', () => {
  it('is zero inside one crack state or when healing', () => {
    expect(crossingFragmentCount(0.9, 0.8)).toBe(0);
    expect(crossingFragmentCount(0.4, 0.6)).toBe(0);
  });
  it('is 3-8 and scales with damage when crossing', () => {
    const small = crossingFragmentCount(0.76, 0.74);
    const big = crossingFragmentCount(0.9, 0.1);
    expect(small).toBeGreaterThanOrEqual(3);
    expect(big).toBe(8);
    expect(big).toBeGreaterThan(small);
  });
});

describe('hitFragmentCount', () => {
  it('sheds 0-2 by hit size', () => {
    expect(hitFragmentCount(1, 100)).toBe(0);
    expect(hitFragmentCount(10, 100)).toBe(1);
    expect(hitFragmentCount(50, 100)).toBe(2);
    expect(hitFragmentCount(5, 0)).toBe(0);
  });
});

describe('ShellDebris', () => {
  const at = new THREE.Vector3();
  it('spawns on high, fades after 4 s, and is capped', () => {
    const d = new ShellDebris('high');
    d.spawnFragments(at, 0xff0000, 5);
    expect(d.liveFragments).toBe(5);
    d.advance(4.1);
    expect(d.liveFragments).toBe(0);
    d.spawnFragments(at, 0xff0000, 500);
    expect(d.liveFragments).toBeLessThanOrEqual(96);
    d.dispose();
  });
  it('does not spawn on low', () => {
    const d = new ShellDebris('low');
    d.spawnFragments(at, 0xff0000, 5);
    expect(d.liveFragments).toBe(0);
    d.dispose();
  });
  it('emits smoke intermittently', () => {
    const d = new ShellDebris('low', () => 0.5);
    for (let i = 0; i < 10; i++) d.tickSmoke('a', at, 0.5);
    expect(d.liveSmoke).toBeGreaterThan(0);
    expect(d.liveSmoke).toBeLessThan(10);
    d.dispose();
  });
});
