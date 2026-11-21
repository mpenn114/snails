import type { Vec3 } from '../state/types.js';
import { carveSphere, type CarveResult } from './carve.js';

/** 3D signed-distance-field grid. Negative = solid, positive = air. */
export class SdfGrid {
  readonly data: Float32Array;

  /** Creates a grid filled with a constant value (default: air). */
  constructor(
    readonly nx: number,
    readonly ny: number,
    readonly nz: number,
    readonly cellSize: number,
    fill = 1,
  ) {
    this.data = new Float32Array(nx * ny * nz).fill(fill);
  }

  /** Linear index of a cell. */
  index(x: number, y: number, z: number): number {
    return x + this.nx * (y + this.ny * z);
  }

  /** Samples the nearest cell at a world position; out of bounds counts as air. */
  sample(p: Vec3): number {
    const x = Math.round(p.x / this.cellSize);
    const y = Math.round(p.y / this.cellSize);
    const z = Math.round(p.z / this.cellSize);
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return 1;
    return this.data[this.index(x, y, z)] ?? 1;
  }

  /** Subtracts a sphere from the terrain (CSG difference) and reports changed chunks. */
  carveSphere(center: Vec3, radius: number): CarveResult {
    return carveSphere(this, center, radius);
  }
}
