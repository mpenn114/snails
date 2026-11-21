import type { ChunkId, SdfGrid } from './sdf-grid.js';

/** Inclusive cell-space box. */
export interface CellRegion {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** A connected group of solid cells not supported by the ground. */
export interface FloatingCluster {
  /** Grid cell indices, ascending. */
  cells: number[];
  /** Inclusive cell bounds of the cluster. */
  bounds: CellRegion;
}

/** Outcome of {@link collapseFloating}. */
export interface CollapseResult {
  removedCells: number;
  /** Sorted, unique chunks (including border neighbours) holding changed cells. */
  chunks: ChunkId[];
}

/** Plain-data collapse event. */
export interface CollapseEvent {
  chunks: ChunkId[];
  removedCells: number;
}

/** Margin in cells added around a carve when searching for floating clusters. */
export const COLLAPSE_MARGIN = 2;

const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

type Cell = readonly [number, number, number];

/** Clamps a region to the grid (whole grid when omitted). */
function clampRegion(grid: SdfGrid, region?: CellRegion): CellRegion {
  if (!region) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: grid.nx - 1, y: grid.ny - 1, z: grid.nz - 1 },
    };
  }
  return {
    min: {
      x: Math.max(0, region.min.x),
      y: Math.max(0, region.min.y),
      z: Math.max(0, region.min.z),
    },
    max: {
      x: Math.min(grid.nx - 1, region.max.x),
      y: Math.min(grid.ny - 1, region.max.y),
      z: Math.min(grid.nz - 1, region.max.z),
    },
  };
}

function inRegion(r: CellRegion, x: number, y: number, z: number): boolean {
  return (
    x >= r.min.x && x <= r.max.x && y >= r.min.y && y <= r.max.y && z >= r.min.z && z <= r.max.z
  );
}

/** True if a solid region cell is anchored by the ground or by solid material outside the region. */
function isAnchor(grid: SdfGrid, r: CellRegion, x: number, y: number, z: number): boolean {
  if (y === 0) return true;
  for (const [dx, dy, dz] of NEIGHBOURS) {
    const nx = x + dx;
    const ny = y + dy;
    const nz = z + dz;
    if (!inRegion(r, nx, ny, nz) && grid.inBounds(nx, ny, nz) && grid.get(nx, ny, nz) < 0)
      return true;
  }
  return false;
}

/** Shared flood state over a region. */
interface Flood {
  grid: SdfGrid;
  r: CellRegion;
  sx: number;
  sy: number;
  mark: Uint8Array;
}

function slot(f: Flood, x: number, y: number, z: number): number {
  return x - f.r.min.x + f.sx * (y - f.r.min.y + f.sy * (z - f.r.min.z));
}

/**
 * Iterative 6-connected fill from the seeds over unmarked solid region cells. Marks visited
 * cells and returns their grid indices (ascending) plus bounds.
 */
function fill(f: Flood, stack: Cell[]): FloatingCluster {
  const { grid, r } = f;
  const cells: number[] = [];
  const lo = { x: Infinity, y: Infinity, z: Infinity };
  const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  while (stack.length > 0) {
    const [x, y, z] = stack.pop() as Cell;
    if (!inRegion(r, x, y, z)) continue;
    const s = slot(f, x, y, z);
    if (f.mark[s] !== 0 || grid.get(x, y, z) >= 0) continue;
    f.mark[s] = 1;
    cells.push(grid.index(x, y, z));
    lo.x = Math.min(lo.x, x);
    lo.y = Math.min(lo.y, y);
    lo.z = Math.min(lo.z, z);
    hi.x = Math.max(hi.x, x);
    hi.y = Math.max(hi.y, y);
    hi.z = Math.max(hi.z, z);
    for (const [dx, dy, dz] of NEIGHBOURS) stack.push([x + dx, y + dy, z + dz]);
  }
  return { cells: cells.sort((p, q) => p - q), bounds: { min: lo, max: hi } };
}

/**
 * Finds solid clusters (value < 0, 6-connected) not connected to the ground (y = 0). With a
 * `region`, only that box (clamped to the grid) is searched; a cluster that reaches solid
 * material outside it is treated as anchored. Clusters are ordered by lowest scan position.
 */
export function findFloatingClusters(grid: SdfGrid, region?: CellRegion): FloatingCluster[] {
  const r = clampRegion(grid, region);
  const sx = r.max.x - r.min.x + 1;
  const sy = r.max.y - r.min.y + 1;
  const sz = r.max.z - r.min.z + 1;
  if (sx <= 0 || sy <= 0 || sz <= 0) return [];
  const f: Flood = { grid, r, sx, sy, mark: new Uint8Array(sx * sy * sz) };
  const solid: Cell[] = [];
  const anchors: Cell[] = [];
  for (let z = r.min.z; z <= r.max.z; z++) {
    for (let y = r.min.y; y <= r.max.y; y++) {
      for (let x = r.min.x; x <= r.max.x; x++) {
        if (grid.get(x, y, z) >= 0) continue;
        solid.push([x, y, z]);
        if (isAnchor(grid, r, x, y, z)) anchors.push([x, y, z]);
      }
    }
  }
  fill(f, anchors);
  const out: FloatingCluster[] = [];
  for (const cell of solid) {
    if (f.mark[slot(f, cell[0], cell[1], cell[2])] === 0) out.push(fill(f, [cell]));
  }
  return out;
}

/** Adds a cell's chunk and any border-neighbour chunks to the set. */
function addChunks(grid: SdfGrid, x: number, y: number, z: number, into: Set<ChunkId>): void {
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (grid.inBounds(x + dx, y + dy, z + dz)) into.add(grid.chunkOf(x + dx, y + dy, z + dz));
      }
}

/**
 * Removes floating clusters by setting their cells to air (`+cellSize`).
 *
 * Stub: `'remove'` is the only mode. Making clusters fall as debris (rigid bodies that
 * re-deposit on landing) is future work.
 */
export function collapseFloating(
  grid: SdfGrid,
  clusters: readonly FloatingCluster[],
  mode: 'remove' = 'remove',
): CollapseResult {
  void mode;
  const touched = new Set<ChunkId>();
  let removedCells = 0;
  const plane = grid.nx * grid.ny;
  for (const cluster of clusters) {
    for (const i of cluster.cells) {
      const x = i % grid.nx;
      const y = Math.floor(i / grid.nx) % grid.ny;
      const z = Math.floor(i / plane);
      grid.set(x, y, z, grid.cellSize);
      addChunks(grid, x, y, z, touched);
      removedCells++;
    }
  }
  return { removedCells, chunks: [...touched].sort((a, b) => a - b) };
}

/**
 * Convenience after a carve: finds and removes floating clusters near a sphere centre
 * (search box = sphere bounds expanded by {@link COLLAPSE_MARGIN} cells).
 */
export function resolveCollapse(
  grid: SdfGrid,
  aroundCentre: { x: number; y: number; z: number },
  radius: number,
): CollapseResult {
  const cs = grid.cellSize;
  const m = COLLAPSE_MARGIN;
  const lo = (v: number): number => Math.floor((v - radius) / cs) - m;
  const hi = (v: number): number => Math.ceil((v + radius) / cs) + m;
  const region: CellRegion = {
    min: { x: lo(aroundCentre.x), y: lo(aroundCentre.y), z: lo(aroundCentre.z) },
    max: { x: hi(aroundCentre.x), y: hi(aroundCentre.y), z: hi(aroundCentre.z) },
  };
  return collapseFloating(grid, findFloatingClusters(grid, region), 'remove');
}
