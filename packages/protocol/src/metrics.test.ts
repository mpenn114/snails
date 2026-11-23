import { describe, expect, it } from 'vitest';
import { Histogram, RateMeter } from './metrics.js';
import { parseClientMessage, parseServerMessage } from './index.js';

describe('Histogram', () => {
  it('is zero when empty', () => {
    expect(new Histogram().summary()).toEqual({ count: 0, p50: 0, p90: 0, p99: 0, max: 0 });
  });
  it('computes bucketed percentiles', () => {
    const h = new Histogram([10, 20, 50]);
    for (let i = 0; i < 90; i++) h.record(5);
    for (let i = 0; i < 9; i++) h.record(15);
    h.record(40);
    expect(h.percentile(0.5)).toBe(10);
    expect(h.percentile(0.9)).toBe(10);
    expect(h.percentile(0.99)).toBe(20);
    expect(h.percentile(1)).toBe(50);
    expect(h.count).toBe(100);
  });
  it('reports max for overflow and ignores bad samples', () => {
    const h = new Histogram([10]);
    h.record(500);
    h.record(-1);
    h.record(Number.NaN);
    expect(h.count).toBe(1);
    expect(h.summary().p99).toBe(500);
    h.reset();
    expect(h.count).toBe(0);
  });
});

describe('RateMeter', () => {
  it('counts events in the window', () => {
    const r = new RateMeter(1000);
    for (let t = 0; t < 1000; t += 100) r.mark(t);
    expect(r.rate(999)).toBe(10);
    expect(r.rate(5000)).toBe(0);
  });
});

describe('seq and ack', () => {
  it('accepts intents with and without seq', () => {
    expect(parseClientMessage({ type: 'jump' })).toEqual({ type: 'jump' });
    expect(parseClientMessage({ type: 'jump', seq: 3 })).toEqual({ type: 'jump', seq: 3 });
    expect(() => parseClientMessage({ type: 'fire', seq: -1 })).toThrow();
  });
  it('parses ack', () => {
    expect(parseServerMessage({ type: 'ack', seq: 1, serverTick: 9 }).type).toBe('ack');
  });
});
