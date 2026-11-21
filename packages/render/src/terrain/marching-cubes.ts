/**
 * Pure, worker-safe iso-surface mesher for one SDF chunk. Negative = solid, iso = 0.
 *
 * Each grid cell is split into six tetrahedra around the main diagonal (Kuhn
 * decomposition). This needs no lookup tables, is unambiguous, and, because
 * every cell is split identically, neighbouring cells and chunks agree on
 * shared faces so the mesh is crack-free.
 */
import type { SdfGrid } from '@snails/core';

/** Samples of one chunk, with a halo so normals match across chunk borders. */
export interface ChunkMeshInput {
  /**
   * Samples, x fastest. Dimensions are `cells + 1 + 2 * halo` per axis: sample
   * (0,0,0) of the chunk is at array coordinate (halo, halo, halo).
   */
  readonly samples: Float32Array;
  /** Cells to mesh along each axis (the +1 border sample is included in `samples`). */
  readonly cells: readonly [number, number, number];
  /** Halo width in samples on every side (1 is required for neighbour-consistent normals). */
  readonly halo: number;
  /** Edge length of a cell in metres. */
  readonly cellSize: number;
  /** World position of the chunk's first sample. */
  readonly origin: readonly [number, number, number];
}

/** Mesh buffers (transferable). Normals point out of the solid. */
export interface ChunkMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
}

type Corner = readonly [number, number, number];

const AXES: readonly Corner[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const PERMS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 2],
  [2, 0],
  [2, 1],
];

/** The 6 tetrahedra of a unit cell as corner offsets. */
const TETS: readonly (readonly Corner[])[] = PERMS.map(([a, b]) => {
  const ea = AXES[a] as Corner;
  const eb = AXES[b] as Corner;
  return [[0, 0, 0], ea, [ea[0] + eb[0], ea[1] + eb[1], ea[2] + eb[2]], [1, 1, 1]] as const;
});

const EMPTY: ChunkMesh = {
  positions: new Float32Array(0),
  normals: new Float32Array(0),
  indices: new Uint32Array(0),
};

const num = (v: number | undefined): number => v ?? 0;

class Builder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly idx: number[] = [];
  private readonly cache = new Map<number, number>();
  private readonly sx: number;
  private readonly sy: number;
  private readonly total: number;

  constructor(private readonly input: ChunkMeshInput) {
    const [cx, cy, cz] = input.cells;
    const pad = 1 + 2 * input.halo;
    this.sx = cx + pad;
    this.sy = cy + pad;
    this.total = this.sx * this.sy * (cz + pad);
  }

  /** Sample at chunk-local coordinates (may reach into the halo). */
  at(c: Corner): number {
    return this.input.samples[this.key(c)] ?? 1;
  }

  private key(c: Corner): number {
    const h = this.input.halo;
    return c[0] + h + this.sx * (c[1] + h + this.sy * (c[2] + h));
  }

  /** Central-difference gradient at a sample (points toward air). */
  private grad(c: Corner): Corner {
    const [i, j, k] = c;
    return [
      this.at([i + 1, j, k]) - this.at([i - 1, j, k]),
      this.at([i, j + 1, k]) - this.at([i, j - 1, k]),
      this.at([i, j, k + 1]) - this.at([i, j, k - 1]),
    ];
  }

  /** Vertex on the edge between two corners, created once and shared. */
  vertex(p: Corner, q: Corner): number {
    const swap = this.key(p) > this.key(q);
    const a = swap ? q : p;
    const b = swap ? p : q;
    const ck = this.key(a) * this.total + this.key(b);
    const found = this.cache.get(ck);
    if (found !== undefined) return found;
    const va = this.at(a);
    const vb = this.at(b);
    const t = va / (va - vb);
    const { cellSize: h, origin } = this.input;
    const ga = this.grad(a);
    const gb = this.grad(b);
    const g = [0, 1, 2].map((n) => num(ga[n]) + t * (num(gb[n]) - num(ga[n])));
    const len = Math.hypot(num(g[0]), num(g[1]), num(g[2])) || 1;
    for (let n = 0; n < 3; n++) {
      const an = num(a[n]);
      this.pos.push((an + t * (num(b[n]) - an)) * h + num(origin[n]));
      this.nrm.push(num(g[n]) / len);
    }
    const id = this.pos.length / 3 - 1;
    this.cache.set(ck, id);
    return id;
  }

  /** Emits a triangle wound so its normal faces `dir` (from solid toward air). */
  tri(a: number, b: number, c: number, dir: Corner): void {
    if (a === b || b === c || a === c) return;
    const p = this.pos;
    const u = [0, 1, 2].map((n) => num(p[b * 3 + n]) - num(p[a * 3 + n]));
    const v = [0, 1, 2].map((n) => num(p[c * 3 + n]) - num(p[a * 3 + n]));
    const nx = num(u[1]) * num(v[2]) - num(u[2]) * num(v[1]);
    const ny = num(u[2]) * num(v[0]) - num(u[0]) * num(v[2]);
    const nz = num(u[0]) * num(v[1]) - num(u[1]) * num(v[0]);
    if (nx * nx + ny * ny + nz * nz < 1e-24) return;
    const dot = nx * dir[0] + ny * dir[1] + nz * dir[2];
    if (dot >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  /** Polygonises one tetrahedron. */
  tet(corners: readonly Corner[]): void {
    const inside: Corner[] = [];
    const outside: Corner[] = [];
    for (const c of corners) (this.at(c) < 0 ? inside : outside).push(c);
    if (inside.length === 0 || outside.length === 0) return;
    const mean = (cs: Corner[], n: number): number =>
      cs.reduce((s, c) => s + num(c[n]), 0) / cs.length;
    const dir: Corner = [
      mean(outside, 0) - mean(inside, 0),
      mean(outside, 1) - mean(inside, 1),
      mean(outside, 2) - mean(inside, 2),
    ];
    const e: number[] = [];
    for (const i of inside) for (const o of outside) e.push(this.vertex(i, o));
    if (e.length === 3) {
      this.tri(num(e[0]), num(e[1]), num(e[2]), dir);
    } else if (e.length === 4) {
      // 2 inside / 2 outside: e = [i0o0, i0o1, i1o0, i1o1] forms the quad 0,1,3,2.
      this.tri(num(e[0]), num(e[1]), num(e[3]), dir);
      this.tri(num(e[0]), num(e[3]), num(e[2]), dir);
    }
  }
}

/** Extracts a triangle mesh of the iso-0 surface of one chunk. */
export function meshChunk(input: ChunkMeshInput): ChunkMesh {
  const [cx, cy, cz] = input.cells;
  if (cx <= 0 || cy <= 0 || cz <= 0) return EMPTY;
  const b = new Builder(input);
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        for (const tet of TETS) {
          b.tet(tet.map((o) => [i + o[0], j + o[1], k + o[2]] as const));
        }
      }
    }
  }
  if (b.idx.length === 0) return EMPTY;
  return {
    positions: Float32Array.from(b.pos),
    normals: Float32Array.from(b.nrm),
    indices: Uint32Array.from(b.idx),
  };
}

/**
 * Builds mesher input for one chunk of a core grid. Cell counts are clipped at
 * the grid edge; samples outside the grid read as air.
 */
export function extractChunkInput(
  grid: SdfGrid,
  cx: number,
  cy: number,
  cz: number,
): ChunkMeshInput {
  const id = grid.chunkIdAt(cx, cy, cz);
  if (id < 0) throw new RangeError(`chunk (${cx},${cy},${cz}) out of range`);
  const { min, max } = grid.chunkBounds(id);
  const halo = 1;
  const cells = [max.x - min.x, max.y - min.y, max.z - min.z] as const;
  const [sx, sy, sz] = cells.map((c) => c + 1 + 2 * halo) as [number, number, number];
  const samples = new Float32Array(sx * sy * sz);
  let n = 0;
  for (let k = 0; k < sz; k++) {
    for (let j = 0; j < sy; j++) {
      for (let i = 0; i < sx; i++) {
        samples[n++] = grid.get(min.x + i - halo, min.y + j - halo, min.z + k - halo);
      }
    }
  }
  const h = grid.cellSize;
  return { samples, cells, halo, cellSize: h, origin: [min.x * h, min.y * h, min.z * h] };
}
