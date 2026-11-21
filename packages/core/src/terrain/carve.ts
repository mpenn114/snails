import type { Vec3 } from '../state/types.js';
import type { SdfGrid } from './sdf-grid.js';

/** Edge length of a terrain chunk, in cells (see docs/graphics.md). */
export const CHUNK_SIZE = 32;

/** Linear id of a chunk: `cx + chunksX * (cy + chunksY * cz)`. */
export type ChunkId = number;

/** Outcome of a sphere carve. */
export interface CarveResult {
  /** Sorted, unique chunks holding changed cells, plus face/edge/corner border neighbours. */
  chunks: ChunkId[];
  /** Number of cells whose value changed. */
  cellsChanged: number;
  /** Approximate removed volume in cubic metres (solid to air cells times cellSize^3). */
  removedVolume: number;
}

/** Plain-data carve event for broadcasting to clients. */
export interface CarveEvent {
  centre: Vec3;
  radius: number;
  chunks: ChunkId[];
}

/** Returns a result describing no change. */
function emptyResult(): CarveResult {
  return { chunks: [], cellsChanged: 0, removedVolume: 0 };
}

/** Number of chunks along one axis for a grid dimension. */
function chunksAlong(cells: number): number {
  return Math.ceil(cells / CHUNK_SIZE);
}

/** Chunk id for chunk coordinates on a grid. */
function chunkIdAt(grid: SdfGrid, cx: number, cy: number, cz: number): ChunkId {
  return cx + chunksAlong(grid.nx) * (cy + chunksAlong(grid.ny) * cz);
}

/** Chunk coordinates an index along one axis touches: its own chunk plus any border neighbour. */
function axisChunks(cell: number, cellCount: number): number[] {
  const c = Math.floor(cell / CHUNK_SIZE);
  const local = cell - c * CHUNK_SIZE;
  const out = [c];
  if (local === 0 && c > 0) out.push(c - 1);
  if (local === CHUNK_SIZE - 1 && (c + 1) * CHUNK_SIZE < cellCount) out.push(c + 1);
  return out;
}

/** Adds the chunk of a changed cell and its border neighbours to the set. */
function markCellChunks(grid: SdfGrid, x: number, y: number, z: number, into: Set<ChunkId>): void {
  for (const cz of axisChunks(z, grid.nz)) {
    for (const cy of axisChunks(y, grid.ny)) {
      for (const cx of axisChunks(x, grid.nx)) {
        into.add(chunkIdAt(grid, cx, cy, cz));
      }
    }
  }
}

/**
 * Subtracts a sphere from the SDF grid (CSG difference), writing cell values directly.
 * Negative cell values are solid, non-negative are air. Returns an empty result for a
 * non-positive radius or a sphere that does not overlap the grid.
 */
export function carveSphere(grid: SdfGrid, centre: Vec3, radius: number): CarveResult {
  if (!(radius > 0)) return emptyResult();
  const cs = grid.cellSize;
  const x0 = Math.max(0, Math.floor((centre.x - radius) / cs));
  const x1 = Math.min(grid.nx - 1, Math.ceil((centre.x + radius) / cs));
  const y0 = Math.max(0, Math.floor((centre.y - radius) / cs));
  const y1 = Math.min(grid.ny - 1, Math.ceil((centre.y + radius) / cs));
  const z0 = Math.max(0, Math.floor((centre.z - radius) / cs));
  const z1 = Math.min(grid.nz - 1, Math.ceil((centre.z + radius) / cs));
  if (x0 > x1 || y0 > y1 || z0 > z1) return emptyResult();

  const touched = new Set<ChunkId>();
  let cellsChanged = 0;
  let removed = 0;
  for (let z = z0; z <= z1; z++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x * cs - centre.x, y * cs - centre.y, z * cs - centre.z);
        const i = grid.index(x, y, z);
        const old = grid.data[i] ?? 1;
        const next = Math.fround(Math.max(old, radius - d));
        if (next === old) continue;
        grid.data[i] = next;
        cellsChanged++;
        if (old < 0 && next >= 0) removed++;
        markCellChunks(grid, x, y, z, touched);
      }
    }
  }
  if (cellsChanged === 0) return emptyResult();
  return {
    chunks: [...touched].sort((a, b) => a - b),
    cellsChanged,
    removedVolume: removed * cs * cs * cs,
  };
}

/** Builds a plain-data carve event from a carve centre, radius and its result. */
export function toCarveEvent(centre: Vec3, radius: number, result: CarveResult): CarveEvent {
  return { centre: { ...centre }, radius, chunks: [...result.chunks] };
}
