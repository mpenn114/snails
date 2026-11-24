import type { Vec3 } from '../state/types.js';
import { maxCarveScale } from './materials.js';
import type { ChunkId, SdfGrid } from './sdf-grid.js';

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
  /** Damage power the carve was made with; omitted = unlimited. */
  power?: number;
  chunks: ChunkId[];
}

/** Returns a result describing no change. */
function emptyResult(): CarveResult {
  return { chunks: [], cellsChanged: 0, removedVolume: 0 };
}

/** Chunk coordinates an index along one axis touches: its own chunk plus any border neighbour. */
function axisChunks(cell: number, cellCount: number, cs: number): number[] {
  const c = Math.floor(cell / cs);
  const local = cell - c * cs;
  const out = [c];
  if (local === 0 && c > 0) out.push(c - 1);
  if (local === cs - 1 && (c + 1) * cs < cellCount) out.push(c + 1);
  return out;
}

/** Adds the chunk of a changed cell and its border neighbours to the set. */
function collectCellChunks(
  grid: SdfGrid,
  x: number,
  y: number,
  z: number,
  into: Set<ChunkId>,
): void {
  const cs = grid.chunkSize;
  for (const cz of axisChunks(z, grid.nz, cs)) {
    for (const cy of axisChunks(y, grid.ny, cs)) {
      for (const cx of axisChunks(x, grid.nx, cs)) {
        const id = grid.chunkIdAt(cx, cy, cz);
        if (id >= 0) into.add(id);
      }
    }
  }
}

/**
 * New SDF value of one cell after a carve (pure; the renderer's replica uses it too).
 * Cells resist individually: the radius is scaled by `1 - carveResistance` of the cell's
 * material, and cells whose material is indestructible below `power` are left unchanged.
 */
export function carvedCellValue(
  grid: SdfGrid,
  x: number,
  y: number,
  z: number,
  centre: Vec3,
  radius: number,
  power = Infinity,
): number {
  const old = grid.get(x, y, z);
  const mat = grid.materialAt(x, y, z);
  if (power < (mat.indestructibleBelowDamage ?? 0)) return old;
  const cs = grid.cellSize;
  const d = Math.hypot(x * cs - centre.x, y * cs - centre.y, z * cs - centre.z);
  return Math.fround(Math.max(old, radius * (1 - mat.carveResistance) - d));
}

/** Writes one cell's carved value; returns 0 if unchanged, 2 if solid became air, else 1. */
function carveCell(
  grid: SdfGrid,
  x: number,
  y: number,
  z: number,
  radius: number,
  c: Vec3,
  power: number,
): number {
  const old = grid.get(x, y, z);
  const next = carvedCellValue(grid, x, y, z, c, radius, power);
  if (next === old) return 0;
  grid.set(x, y, z, next);
  return old < 0 && next >= 0 ? 2 : 1;
}

/**
 * Subtracts a sphere from the SDF grid (CSG difference), marking changed cells dirty.
 * Negative cell values are solid, non-negative are air. Returns an empty result for a
 * non-positive radius or a sphere that does not overlap the grid. `power` (default unlimited)
 * is compared with each material's `indestructibleBelowDamage`.
 */
export function carveSphere(
  grid: SdfGrid,
  centre: Vec3,
  radius: number,
  power = Infinity,
): CarveResult {
  if (!(radius > 0)) return emptyResult();
  const cs = grid.cellSize;
  const reach = radius * maxCarveScale(grid.materialTable);
  const x0 = Math.max(0, Math.floor((centre.x - reach) / cs));
  const x1 = Math.min(grid.nx - 1, Math.ceil((centre.x + reach) / cs));
  const y0 = Math.max(0, Math.floor((centre.y - reach) / cs));
  const y1 = Math.min(grid.ny - 1, Math.ceil((centre.y + reach) / cs));
  const z0 = Math.max(0, Math.floor((centre.z - reach) / cs));
  const z1 = Math.min(grid.nz - 1, Math.ceil((centre.z + reach) / cs));
  if (x0 > x1 || y0 > y1 || z0 > z1) return emptyResult();

  const touched = new Set<ChunkId>();
  let cellsChanged = 0;
  let removed = 0;
  for (let z = z0; z <= z1; z++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const status = carveCell(grid, x, y, z, radius, centre, power);
        if (status === 0) continue;
        cellsChanged++;
        if (status === 2) removed++;
        collectCellChunks(grid, x, y, z, touched);
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
export function toCarveEvent(
  centre: Vec3,
  radius: number,
  result: CarveResult,
  power = Infinity,
): CarveEvent {
  const ev: CarveEvent = { centre: { ...centre }, radius, chunks: [...result.chunks] };
  if (Number.isFinite(power)) ev.power = power;
  return ev;
}
