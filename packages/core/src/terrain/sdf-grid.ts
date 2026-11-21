import type { Vec3 } from '../state/types.js';

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

  /** Subtracts a sphere from the terrain (CSG difference). */
  carveSphere(center: Vec3, radius: number): void {
    const r = Math.ceil(radius / this.cellSize) + 1;
    const cx = Math.round(center.x / this.cellSize);
    const cy = Math.round(center.y / this.cellSize);
    const cz = Math.round(center.z / this.cellSize);
    for (let z = Math.max(0, cz - r); z <= Math.min(this.nz - 1, cz + r); z++) {
      for (let y = Math.max(0, cy - r); y <= Math.min(this.ny - 1, cy + r); y++) {
        for (let x = Math.max(0, cx - r); x <= Math.min(this.nx - 1, cx + r); x++) {
          const d = Math.hypot(
            x * this.cellSize - center.x,
            y * this.cellSize - center.y,
            z * this.cellSize - center.z,
          );
          const sphere = d - radius;
          const i = this.index(x, y, z);
          this.data[i] = Math.max(this.data[i] ?? 1, -sphere);
        }
      }
    }
  }
}
