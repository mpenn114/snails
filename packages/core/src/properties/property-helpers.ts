import { Rng } from '../rng.js';
import { SdfGrid } from '../terrain/sdf-grid.js';

/** Number of generated cases per property (keeps the whole property suite fast). */
export const PROPERTY_CASES = 200;

/**
 * Builds the assertion message for a failing generated case. Including the base seed and
 * case index makes every failure reproducible with `new Rng(seed)` and the same loop.
 */
export function caseLabel(property: string, baseSeed: number, caseIndex: number): string {
  return `${property} failed: baseSeed=${baseSeed} case=${caseIndex}`;
}

/** Returns a deterministic per-case generator derived from the property's base seed. */
export function caseRng(baseSeed: number, caseIndex: number): Rng {
  return new Rng((Math.imul(baseSeed, 0x9e3779b1) + caseIndex * 0x85ebca6b) >>> 0);
}

/** True if two Float32Arrays hold identical bytes (exact, including signed zeros). */
export function sameBytes(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  const ua = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const ub = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return false;
  return true;
}

/** Index of the first differing element, or -1 if the arrays are equal. */
export function firstDifference(a: Float32Array, b: Float32Array): number {
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return i;
  return -1;
}

/** FNV-1a 32-bit hash over the raw bytes of a Float32Array (terrain checksum). */
export function fnv1aBytes(data: Float32Array): number {
  const u = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) {
    h ^= u[i] ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Generates a random SDF grid from the case RNG: random dimensions, cell size and chunk size,
 * with random cell values spanning solid and air.
 */
export function randomGrid(rng: Rng): SdfGrid {
  const nx = rng.int(8, 28);
  const ny = rng.int(8, 28);
  const nz = rng.int(8, 28);
  const cellSize = [0.25, 0.5, 1][rng.int(0, 2)] ?? 0.5;
  const chunkSize = [4, 8, 16][rng.int(0, 2)] ?? 16;
  const grid = new SdfGrid(nx, ny, nz, cellSize, 1, chunkSize);
  for (let i = 0; i < grid.data.length; i++) grid.data[i] = Math.fround(rng.range(-4, 4));
  return grid;
}

/** Copies a grid's cell data into a fresh grid with the same shape. */
export function cloneGrid(src: SdfGrid): SdfGrid {
  const g = new SdfGrid(src.nx, src.ny, src.nz, src.cellSize, 1, src.chunkSize);
  g.data.set(src.data);
  return g;
}
