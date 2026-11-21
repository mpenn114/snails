import { describe, expect, it } from 'vitest';
import { Rng } from './rng.js';
import { RNG_STREAM_NAMES, RngStreams, type RngStreamsState } from './rng-streams.js';

const take = (r: Rng, n: number): number[] => Array.from({ length: n }, () => r.next());

describe('Rng state', () => {
  it('getState/setState resumes the exact sequence', () => {
    const r = new Rng(99);
    take(r, 5);
    const saved = r.getState();
    const expected = take(r, 10);
    r.setState(saved);
    expect(take(r, 10)).toEqual(expected);
  });
});

describe('RngStreams', () => {
  it('same seed gives same sequences', () => {
    const a = new RngStreams(1234);
    const b = new RngStreams(1234);
    for (const name of RNG_STREAM_NAMES) {
      expect(take(a.get(name), 8)).toEqual(take(b.get(name), 8));
    }
  });

  it('different streams differ for the same seed', () => {
    const s = new RngStreams(7);
    const firsts = RNG_STREAM_NAMES.map((n) => take(s.get(n), 4).join(','));
    expect(new Set(firsts).size).toBe(RNG_STREAM_NAMES.length);
  });

  it('different master seeds give different streams', () => {
    expect(take(new RngStreams(1).terrain, 4)).not.toEqual(take(new RngStreams(2).terrain, 4));
  });

  it('property accessors match get()', () => {
    const s = new RngStreams(5);
    expect(s.terrain).toBe(s.get('terrain'));
    expect(s.wind).toBe(s.get('wind'));
    expect(s.crates).toBe(s.get('crates'));
    expect(s.ai).toBe(s.get('ai'));
  });

  it('advancing one stream does not affect another', () => {
    const a = new RngStreams(42);
    const b = new RngStreams(42);
    take(a.terrain, 100);
    expect(take(a.wind, 5)).toEqual(take(b.wind, 5));
  });

  it('save/restore resumes every stream exactly', () => {
    const s = new RngStreams(31337);
    for (const name of RNG_STREAM_NAMES) take(s.get(name), 3);
    const snap = s.saveState();
    const expected = RNG_STREAM_NAMES.map((n) => take(s.get(n), 6));

    const restored = RngStreams.fromState(snap);
    expect(RNG_STREAM_NAMES.map((n) => take(restored.get(n), 6))).toEqual(expected);

    const other = new RngStreams(0);
    other.restoreState(snap);
    expect(RNG_STREAM_NAMES.map((n) => take(other.get(n), 6))).toEqual(expected);
  });

  it('state survives a JSON round-trip', () => {
    const s = new RngStreams(2024);
    take(s.ai, 10);
    const json = JSON.stringify(s.saveState());
    const parsed = JSON.parse(json) as RngStreamsState;
    expect(parsed).toEqual(s.saveState());
    const restored = RngStreams.fromState(parsed);
    expect(take(restored.ai, 5)).toEqual(take(s.ai, 5));
  });
});
