import { Vector4 } from 'three';

/** Seconds over which fresh scorch fades to {@link SCORCH_FLOOR}. */
export const SCORCH_FADE_S = 10;
/** Scorch strength that remains forever so crater history stays visible. */
export const SCORCH_FLOOR = 0.4;

/** Scorch strength (1 fresh, down to {@link SCORCH_FLOOR}) for an age in seconds. */
export function scorchStrength(age: number): number {
  const t = Math.min(1, Math.max(0, age / SCORCH_FADE_S));
  return 1 - (1 - SCORCH_FLOOR) * t;
}

/**
 * Fixed-size ring buffer of recent explosions for the terrain shader. `centres` (xyz = centre,
 * w = radius; w = 0 marks an empty slot) and `strength` are shared with shader uniform arrays.
 * View-only: it never feeds back into the simulation.
 */
export class ScorchRing {
  /** Uniform array of centre and radius. */
  readonly centres: Vector4[];
  /** Uniform array of per-blast scorch strength. */
  readonly strength: number[];
  private readonly ages: number[];
  private next = 0;

  /** Creates an empty ring of `capacity` slots. */
  constructor(readonly capacity: number) {
    this.centres = Array.from({ length: capacity }, () => new Vector4(0, 0, 0, 0));
    this.strength = new Array<number>(capacity).fill(0);
    this.ages = new Array<number>(capacity).fill(0);
  }

  /** Records an explosion, overwriting the oldest slot when full. */
  add(x: number, y: number, z: number, radius: number): void {
    if (this.capacity === 0 || !(radius > 0)) return;
    this.centres[this.next]?.set(x, y, z, radius);
    this.ages[this.next] = 0;
    this.strength[this.next] = 1;
    this.next = (this.next + 1) % this.capacity;
  }

  /** Ages every active blast by `dt` seconds and refreshes strengths. */
  advance(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if ((this.centres[i]?.w ?? 0) <= 0) continue;
      const age = (this.ages[i] ?? 0) + dt;
      this.ages[i] = age;
      this.strength[i] = scorchStrength(age);
    }
  }

  /** Number of occupied slots. */
  get count(): number {
    return this.centres.filter((c) => c.w > 0).length;
  }

  /** Empties the ring. */
  clear(): void {
    for (const c of this.centres) c.set(0, 0, 0, 0);
    this.strength.fill(0);
    this.ages.fill(0);
    this.next = 0;
  }
}
