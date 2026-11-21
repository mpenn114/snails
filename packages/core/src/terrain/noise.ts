import type { Rng } from '../rng.js';

/** Seeded lattice value noise with a permutation table. Output is roughly in [-1, 1]. */
export class ValueNoise {
  private readonly perm = new Uint8Array(512);
  private readonly vals = new Float32Array(256);

  /** Builds the permutation table and lattice values from the rng (consumes rng state). */
  constructor(rng: Rng) {
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      const t = p[i] as number;
      p[i] = p[j] as number;
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255] as number;
    for (let i = 0; i < 256; i++) this.vals[i] = rng.range(-1, 1);
  }

  private lat(x: number, y: number, z: number): number {
    const p = this.perm;
    const h = p[(p[(p[x & 255] as number) + (y & 255)] as number) + (z & 255)] as number;
    return this.vals[h] as number;
  }

  /** Smooth 3D noise at a point. */
  noise3(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const s = (t: number): number => t * t * (3 - 2 * t);
    const u = s(x - xi);
    const v = s(y - yi);
    const w = s(z - zi);
    const l = (a: number, b: number, t: number): number => a + (b - a) * t;
    const c = (dy: number, dz: number): number =>
      l(this.lat(xi, yi + dy, zi + dz), this.lat(xi + 1, yi + dy, zi + dz), u);
    return l(l(c(0, 0), c(1, 0), v), l(c(0, 1), c(1, 1), v), w);
  }

  /** Smooth 2D noise at a point. */
  noise2(x: number, z: number): number {
    return this.noise3(x, 0, z);
  }

  /** 2D fractal Brownian motion, normalised to roughly [-1, 1]. */
  fbm2(x: number, z: number, octaves: number): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2(x * f + o * 17.3, z * f - o * 9.1);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }

  /** 3D fractal Brownian motion, normalised to roughly [-1, 1]. */
  fbm3(x: number, y: number, z: number, octaves: number): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise3(x * f + o * 17.3, y * f + o * 5.7, z * f - o * 9.1);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
}
