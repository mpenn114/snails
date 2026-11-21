import type { Vec3 } from '../state/types.js';

/** Default chunk edge length in cells. */
export const DEFAULT_CHUNK_SIZE = 16;

/** Chunk index: `cx + chunksX * (cy + chunksY * cz)`; ascending order is deterministic. */
export type ChunkId = number;

/** Cell bounds of a chunk: min inclusive, max exclusive (clipped to the grid). */
export interface ChunkBounds {
  readonly min: { readonly x: number; readonly y: number; readonly z: number };
  readonly max: { readonly x: number; readonly y: number; readonly z: number };
}

/** 3D signed-distance-field grid. Negative = solid, positive = air. */
export class SdfGrid {
  readonly data: Float32Array;
  /** Chunk edge length in cells. */
  readonly chunkSize: number;
  /** Chunk count along X. */
  readonly chunksX: number;
  /** Chunk count along Y. */
  readonly chunksY: number;
  /** Chunk count along Z. */
  readonly chunksZ: number;
  private readonly dirty = new Set<ChunkId>();

  /** Creates a grid filled with a constant value (default: air). */
  constructor(
    readonly nx: number,
    readonly ny: number,
    readonly nz: number,
    readonly cellSize: number,
    fill = 1,
    chunkSize = DEFAULT_CHUNK_SIZE,
  ) {
    this.data = new Float32Array(nx * ny * nz).fill(fill);
    this.chunkSize = chunkSize;
    this.chunksX = Math.ceil(nx / chunkSize);
    this.chunksY = Math.ceil(ny / chunkSize);
    this.chunksZ = Math.ceil(nz / chunkSize);
  }

  /** Linear index of a cell. */
  index(x: number, y: number, z: number): number {
    return x + this.nx * (y + this.ny * z);
  }

  /** World-space extent of the grid (cells span 0..(n-1)*cellSize). */
  worldSize(): Vec3 {
    return {
      x: (this.nx - 1) * this.cellSize,
      y: (this.ny - 1) * this.cellSize,
      z: (this.nz - 1) * this.cellSize,
    };
  }

  /** True if the cell coordinate is inside the grid. */
  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz;
  }

  /** Cell value; out of bounds is air (1). */
  get(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return 1;
    return this.data[this.index(x, y, z)] ?? 1;
  }

  /** Sets a cell value and marks affected chunks dirty; out of bounds is ignored. */
  set(x: number, y: number, z: number, v: number): void {
    if (!this.inBounds(x, y, z)) return;
    this.data[this.index(x, y, z)] = v;
    this.markCellDirty(x, y, z);
  }

  /** Total number of chunks. */
  chunkCount(): number {
    return this.chunksX * this.chunksY * this.chunksZ;
  }

  /** Chunk id from chunk coordinates, or -1 if out of range. */
  chunkIdAt(cx: number, cy: number, cz: number): ChunkId {
    if (cx < 0 || cy < 0 || cz < 0) return -1;
    if (cx >= this.chunksX || cy >= this.chunksY || cz >= this.chunksZ) return -1;
    return cx + this.chunksX * (cy + this.chunksY * cz);
  }

  /** Chunk containing a cell (coordinates are clamped into the grid). */
  chunkOf(x: number, y: number, z: number): ChunkId {
    const cs = this.chunkSize;
    const c = (v: number, n: number): number => Math.min(n - 1, Math.max(0, Math.floor(v / cs)));
    return this.chunkIdAt(c(x, this.chunksX), c(y, this.chunksY), c(z, this.chunksZ));
  }

  /** Cell bounds (min inclusive, max exclusive, clipped to the grid) of a chunk. */
  chunkBounds(id: ChunkId): ChunkBounds {
    const cs = this.chunkSize;
    const cx = id % this.chunksX;
    const cy = Math.floor(id / this.chunksX) % this.chunksY;
    const cz = Math.floor(id / (this.chunksX * this.chunksY));
    return {
      min: { x: cx * cs, y: cy * cs, z: cz * cs },
      max: {
        x: Math.min(this.nx, (cx + 1) * cs),
        y: Math.min(this.ny, (cy + 1) * cs),
        z: Math.min(this.nz, (cz + 1) * cs),
      },
    };
  }

  /** All chunk ids in ascending order. */
  chunkIds(): ChunkId[] {
    return Array.from({ length: this.chunkCount() }, (_, i) => i);
  }

  /** Marks one chunk dirty (invalid ids are ignored). */
  markDirty(id: ChunkId): void {
    if (id >= 0 && id < this.chunkCount()) this.dirty.add(id);
  }

  /** True if the chunk is dirty. */
  isDirty(id: ChunkId): boolean {
    return this.dirty.has(id);
  }

  /** Marks the cell's chunk and, on chunk borders, the adjacent chunks dirty. */
  markCellDirty(x: number, y: number, z: number): void {
    const cs = this.chunkSize;
    const offs = (v: number): number[] => {
      const m = v % cs;
      const o = [0];
      if (m === 0) o.push(-1);
      if (m === cs - 1) o.push(1);
      return o;
    };
    const bx = Math.floor(x / cs);
    const by = Math.floor(y / cs);
    const bz = Math.floor(z / cs);
    for (const dz of offs(z)) {
      for (const dy of offs(y)) {
        for (const dx of offs(x)) this.markDirty(this.chunkIdAt(bx + dx, by + dy, bz + dz));
      }
    }
  }

  /** Returns dirty chunk ids sorted ascending and clears the dirty set. */
  takeDirtyChunks(): ChunkId[] {
    const out = [...this.dirty].sort((a, b) => a - b);
    this.dirty.clear();
    return out;
  }

  /** Samples the nearest cell at a world position; out of bounds counts as air. */
  sample(p: Vec3): number {
    return this.get(
      Math.round(p.x / this.cellSize),
      Math.round(p.y / this.cellSize),
      Math.round(p.z / this.cellSize),
    );
  }

  /** Trilinearly interpolated field value at a world position. */
  sampleLinear(p: Vec3): number {
    const fx = p.x / this.cellSize;
    const fy = p.y / this.cellSize;
    const fz = p.z / this.cellSize;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const ty = fy - y0;
    const tz = fz - z0;
    const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
    const row = (y: number, z: number): number =>
      lerp(this.get(x0, y, z), this.get(x0 + 1, y, z), tx);
    const plane = (z: number): number => lerp(row(y0, z), row(y0 + 1, z), ty);
    return lerp(plane(z0), plane(z0 + 1), tz);
  }

  /** Field gradient at a point via central differences (one cell step). */
  gradient(p: Vec3): Vec3 {
    const h = this.cellSize;
    const s = (dx: number, dy: number, dz: number): number =>
      this.sampleLinear({ x: p.x + dx, y: p.y + dy, z: p.z + dz });
    return {
      x: (s(h, 0, 0) - s(-h, 0, 0)) / (2 * h),
      y: (s(0, h, 0) - s(0, -h, 0)) / (2 * h),
      z: (s(0, 0, h) - s(0, 0, -h)) / (2 * h),
    };
  }

  /** Unit surface normal (points toward air); zero vector if the gradient vanishes. */
  normal(p: Vec3): Vec3 {
    const g = this.gradient(p);
    const len = Math.hypot(g.x, g.y, g.z);
    if (len < 1e-9) return { x: 0, y: 0, z: 0 };
    return { x: g.x / len, y: g.y / len, z: g.z / len };
  }

  /** True if the interpolated field at p is solid (negative). */
  isSolid(p: Vec3): boolean {
    return this.sampleLinear(p) < 0;
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
          const next = Math.max(this.get(x, y, z), -(d - radius));
          if (next !== this.get(x, y, z)) this.set(x, y, z, next);
        }
      }
    }
  }
}
