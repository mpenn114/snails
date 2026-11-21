import { Rng } from './rng.js';

/** Names of the independent RNG streams. */
export const RNG_STREAM_NAMES = ['terrain', 'wind', 'crates', 'ai'] as const;

/** A single named RNG stream. */
export type RngStreamName = (typeof RNG_STREAM_NAMES)[number];

/** Plain JSON-serialisable snapshot of all streams. */
export interface RngStreamsState {
  /** Master seed the streams were derived from (uint32). */
  seed: number;
  /** Current mulberry32 state of each stream (uint32). */
  streams: Record<RngStreamName, number>;
}

/** Murmur3 32-bit finaliser: avalanches all input bits. */
function fmix32(h: number): number {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** FNV-1a 32-bit hash of a stream name. */
function hashName(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Derives a stream's starting seed from the master seed and stream name. */
function deriveSeed(master: number, name: RngStreamName): number {
  return fmix32((master >>> 0) ^ fmix32(hashName(name) ^ 0x9e3779b9));
}

/**
 * Independent seeded RNG streams (terrain, wind, crates, ai) derived from one master seed.
 * Each stream's state can be saved to JSON and restored to resume the exact sequence.
 */
export class RngStreams {
  private readonly seed: number;
  private readonly rngs: Record<RngStreamName, Rng>;

  /** @param seed - Master seed; coerced to uint32. */
  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rngs = {
      terrain: new Rng(deriveSeed(this.seed, 'terrain')),
      wind: new Rng(deriveSeed(this.seed, 'wind')),
      crates: new Rng(deriveSeed(this.seed, 'crates')),
      ai: new Rng(deriveSeed(this.seed, 'ai')),
    };
  }

  /** The terrain stream. */
  get terrain(): Rng {
    return this.rngs.terrain;
  }

  /** The wind stream. */
  get wind(): Rng {
    return this.rngs.wind;
  }

  /** The crates stream. */
  get crates(): Rng {
    return this.rngs.crates;
  }

  /** The AI stream. */
  get ai(): Rng {
    return this.rngs.ai;
  }

  /** Returns the stream with the given name. */
  get(name: RngStreamName): Rng {
    return this.rngs[name];
  }

  /** Captures the master seed and every stream's state as a plain JSON object. */
  saveState(): RngStreamsState {
    return {
      seed: this.seed,
      streams: {
        terrain: this.rngs.terrain.getState(),
        wind: this.rngs.wind.getState(),
        crates: this.rngs.crates.getState(),
        ai: this.rngs.ai.getState(),
      },
    };
  }

  /** Overwrites every stream's state from a snapshot taken by {@link RngStreams.saveState}. */
  restoreState(state: RngStreamsState): void {
    for (const name of RNG_STREAM_NAMES) {
      this.rngs[name].setState(state.streams[name]);
    }
  }

  /** Builds a new RngStreams instance from a snapshot taken by {@link RngStreams.saveState}. */
  static fromState(state: RngStreamsState): RngStreams {
    const streams = new RngStreams(state.seed);
    streams.restoreState(state);
    return streams;
  }
}
