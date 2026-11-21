import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { RngStreams } from '../rng-streams.js';
import { facingVector } from '../entities/snail.js';
import { windAcceleration } from '../physics/ballistics.js';
import { DEFAULT_WIND_CONFIG, rollWind, type WindConfig } from './wind.js';

const RANDOM: WindConfig = { maxStrength: 10, maxChangePerTurn: 0.25, mode: 'random' };

describe('rollWind', () => {
  it('same seed gives the same wind sequence', () => {
    const roll = (seed: number) => {
      const rng = new Rng(seed);
      let w = { strength: 0, direction: 0 };
      const out = [];
      for (let i = 0; i < 20; i++) {
        w = rollWind(w, rng, RANDOM);
        out.push(w);
      }
      return out;
    };
    expect(roll(42)).toEqual(roll(42));
    expect(roll(42)).not.toEqual(roll(43));
  });

  it('random mode stays within strength [0, max) and direction [-PI, PI)', () => {
    const rng = new Rng(7);
    let w = { strength: 0, direction: 0 };
    for (let i = 0; i < 500; i++) {
      w = rollWind(w, rng, RANDOM);
      expect(w.strength).toBeGreaterThanOrEqual(0);
      expect(w.strength).toBeLessThan(RANDOM.maxStrength);
      expect(w.direction).toBeGreaterThanOrEqual(-Math.PI);
      expect(w.direction).toBeLessThan(Math.PI);
    }
  });

  it('drift changes by at most maxChangePerTurn and respects bounds', () => {
    const cfg: WindConfig = { maxStrength: 10, maxChangePerTurn: 0.1, mode: 'drift' };
    const rng = new Rng(99);
    let w = { strength: 5, direction: 0 };
    for (let i = 0; i < 1000; i++) {
      const next = rollWind(w, rng, cfg);
      expect(next.strength).toBeGreaterThanOrEqual(0);
      expect(next.strength).toBeLessThanOrEqual(cfg.maxStrength);
      expect(Math.abs(next.strength - w.strength)).toBeLessThanOrEqual(1 + 1e-9);
      expect(next.direction).toBeGreaterThanOrEqual(-Math.PI);
      expect(next.direction).toBeLessThan(Math.PI);
      const dDir = Math.abs(next.direction - w.direction);
      expect(Math.min(dDir, 2 * Math.PI - dDir)).toBeLessThanOrEqual(0.1 * Math.PI + 1e-9);
      w = next;
    }
  });

  it('drift keeps strength within bounds when pushed past them', () => {
    const cfg: WindConfig = { maxStrength: 4, maxChangePerTurn: 1, mode: 'drift' };
    const rng = new Rng(3);
    let w = { strength: 4, direction: 3.1 };
    for (let i = 0; i < 200; i++) {
      w = rollWind(w, rng, cfg);
      expect(w.strength).toBeGreaterThanOrEqual(0);
      expect(w.strength).toBeLessThanOrEqual(4);
    }
  });

  it('off mode is zero strength', () => {
    const rng = new Rng(1);
    expect(rollWind({ strength: 6, direction: 2 }, rng, { ...RANDOM, mode: 'off' })).toEqual({
      strength: 0,
      direction: 0,
    });
  });

  it('default config rolls within its range', () => {
    const w = rollWind({ strength: 0, direction: 0 }, new Rng(5), DEFAULT_WIND_CONFIG);
    expect(w.strength).toBeLessThan(DEFAULT_WIND_CONFIG.maxStrength);
  });

  it('is deterministic on the wind stream of RngStreams', () => {
    const a = rollWind({ strength: 0, direction: 0 }, new RngStreams(11).wind, RANDOM);
    const b = rollWind({ strength: 0, direction: 0 }, new RngStreams(11).wind, RANDOM);
    expect(a).toEqual(b);
  });
});

describe('wind direction convention', () => {
  it('matches snail facingVector for any angle', () => {
    for (const d of [0, 0.7, Math.PI / 2, 2.5, -1.2]) {
      const f = facingVector({ facing: d } as Parameters<typeof facingVector>[0]);
      const a = windAcceleration({ strength: 1, direction: d });
      expect(a.x).toBeCloseTo(f.x, 12);
      expect(a.y).toBe(0);
      expect(a.z).toBeCloseTo(f.z, 12);
    }
  });
});
