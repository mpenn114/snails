import { describe, expect, it } from 'vitest';
import { SCORCH_FLOOR, ScorchRing, scorchStrength } from './scorch-ring.js';

describe('scorchStrength', () => {
  it('fades from 1 to the floor over 10 s and holds', () => {
    expect(scorchStrength(0)).toBe(1);
    expect(scorchStrength(5)).toBeCloseTo((1 + SCORCH_FLOOR) / 2);
    expect(scorchStrength(10)).toBeCloseTo(SCORCH_FLOOR);
    expect(scorchStrength(500)).toBeCloseTo(SCORCH_FLOOR);
  });
});

describe('ScorchRing', () => {
  it('stores blasts and ignores non-positive radii', () => {
    const r = new ScorchRing(4);
    r.add(1, 2, 3, 2.5);
    r.add(0, 0, 0, 0);
    expect(r.count).toBe(1);
    expect(r.centres[0]?.toArray()).toEqual([1, 2, 3, 2.5]);
    expect(r.strength[0]).toBe(1);
  });
  it('overwrites the oldest slot when full', () => {
    const r = new ScorchRing(2);
    r.add(1, 0, 0, 1);
    r.add(2, 0, 0, 1);
    r.add(3, 0, 0, 1);
    expect(r.centres.map((c) => c.x)).toEqual([3, 2]);
    expect(r.count).toBe(2);
  });
  it('ages blasts independently', () => {
    const r = new ScorchRing(3);
    r.add(0, 0, 0, 1);
    r.advance(10);
    r.add(1, 0, 0, 1);
    r.advance(1);
    expect(r.strength[0]).toBeCloseTo(SCORCH_FLOOR);
    expect(r.strength[1]).toBeCloseTo(scorchStrength(1));
    expect(r.strength[2]).toBe(0);
  });
  it('clears and tolerates zero capacity', () => {
    const r = new ScorchRing(2);
    r.add(1, 1, 1, 1);
    r.clear();
    expect(r.count).toBe(0);
    const z = new ScorchRing(0);
    z.add(1, 1, 1, 1);
    z.advance(1);
    expect(z.count).toBe(0);
  });
});
