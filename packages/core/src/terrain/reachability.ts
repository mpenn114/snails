import type { Vec3 } from '../state/types.js';
import { DEFAULT_MOVEMENT_CONFIG } from '../movement/movement-config.js';
import { GRAVITY } from '../physics/ballistics.js';
import type { SdfGrid } from './sdf-grid.js';

/** Tunables of the reachability analysis (metres); the defaults are a conservative move envelope. */
export interface ReachabilityOptions {
  /** Surfaces below this world Y are not standable (the water line plus a margin). */
  minY: number;
  /** Open height above a surface a snail needs to stand there. */
  clearance: number;
  /** Steepest standable surface: minimum normal.y. */
  minNormalY: number;
  /** Largest rise per metre of horizontal run that still counts as crawling. */
  crawlGrade: number;
  /** Largest rise a jump can safely clear. */
  jumpRise: number;
  /** Largest edge-to-edge horizontal gap a level jump can safely clear. */
  jumpGap: number;
}

const MOVE = DEFAULT_MOVEMENT_CONFIG;
/** Apex height of a standing jump (m): v^2 / 2g. */
const JUMP_APEX = (MOVE.jumpUpSpeed * MOVE.jumpUpSpeed) / (2 * GRAVITY);
/** Level airtime distance of a jump (m). */
const JUMP_RANGE = (2 * MOVE.jumpUpSpeed * MOVE.jumpForwardSpeed) / GRAVITY;

/** Default options for a grid with the given water level. Margins keep the envelope conservative. */
export function defaultReachabilityOptions(waterLevel: number): ReachabilityOptions {
  return {
    minY: waterLevel + 0.25,
    clearance: 1.1,
    minNormalY: Math.cos(MOVE.maxSlope) + 0.03,
    crawlGrade: 0.9,
    jumpRise: JUMP_APEX * 0.6,
    jumpGap: JUMP_RANGE * 0.75,
  };
}

/** Standable surface nodes of a grid, grouped into connected components. */
export interface ReachabilityMap {
  readonly nx: number;
  readonly nz: number;
  readonly cellSize: number;
  /** Node count. */
  readonly count: number;
  /** CSR index: nodes of column `x + nx * z` are `colStart[c] .. colStart[c + 1]` (ascending Y). */
  readonly colStart: Int32Array;
  /** Surface height (m) per node. */
  readonly nodeY: Float32Array;
  /** Component id per node (dense, from 0). */
  readonly comp: Int32Array;
  /** Standable area (m^2) per component. */
  readonly compArea: Float64Array;
}

/** Node ids of column (x, z) are `[from, to)`. */
export function columnNodes(map: ReachabilityMap, x: number, z: number): [number, number] {
  const c = x + map.nx * z;
  return [map.colStart[c] as number, map.colStart[c + 1] as number];
}

/** Nearest node (by height) of column (x, z) to world height `y`, or -1 if the column has none. */
export function nodeNear(map: ReachabilityMap, x: number, z: number, y: number): number {
  if (x < 0 || z < 0 || x >= map.nx || z >= map.nz) return -1;
  const [a, b] = columnNodes(map, x, z);
  let best = -1;
  for (let i = a; i < b; i++) {
    if (
      best < 0 ||
      Math.abs((map.nodeY[i] as number) - y) < Math.abs((map.nodeY[best] as number) - y)
    )
      best = i;
  }
  return best;
}

/** Surface normal.y at cell (x, y, z) from central differences of the stored field. */
function cellNormalY(grid: SdfGrid, x: number, y: number, z: number): number {
  const d = grid.data;
  const i = grid.index(x, y, z);
  const inside = x > 0 && z > 0 && x < grid.nx - 1 && z < grid.nz - 1;
  const at = (dx: number, dy: number, dz: number): number =>
    inside
      ? (d[i + dx + grid.nx * (dy + grid.ny * dz)] as number)
      : grid.get(x + dx, y + dy, z + dz);
  const gx = at(1, 0, 0) - at(-1, 0, 0);
  const gy = at(0, 1, 0) - at(0, -1, 0);
  const gz = at(0, 0, 1) - at(0, 0, -1);
  const len = Math.hypot(gx, gy, gz);
  return len < 1e-9 ? 0 : gy / len;
}

/** Standable floor heights (m) of one column: solid-to-air crossings with headroom and a gentle slope. */
function columnFloors(grid: SdfGrid, x: number, z: number, o: ReachabilityOptions): number[] {
  const out: number[] = [];
  const { cellSize: cs, nx, ny } = grid;
  const d = grid.data;
  const base = x + nx * ny * z;
  const top = ny - 1;
  const first = Math.max(0, Math.floor(o.minY / cs) - 1);
  for (let y = first; y < top; y++) {
    const a = d[base + nx * y] as number;
    const b = d[base + nx * (y + 1)] as number;
    if (!(a < 0 && b >= 0)) continue;
    const h = (y + a / (a - b)) * cs;
    if (h < o.minY) continue;
    let open = true;
    for (let k = y + 2; k <= top && k * cs < h + o.clearance; k++) {
      if ((d[base + nx * k] as number) < 0) {
        open = false;
        break;
      }
    }
    if (open && cellNormalY(grid, x, y, z) + cellNormalY(grid, x, y + 1, z) >= 2 * o.minNormalY) {
      out.push(h);
    }
  }
  return out;
}

class UnionFind {
  private readonly parent: Int32Array;
  constructor(n: number) {
    this.parent = new Int32Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }
  find(i: number): number {
    let r = i;
    while (this.parent[r] !== r) r = this.parent[r] as number;
    let c = i;
    while (this.parent[c] !== r) {
      const n = this.parent[c] as number;
      this.parent[c] = r;
      c = n;
    }
    return r;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

/** Collects the standable nodes of every column into CSR arrays. */
function collectNodes(
  grid: SdfGrid,
  o: ReachabilityOptions,
): { colStart: Int32Array; nodeY: Float32Array } {
  const { nx, nz } = grid;
  const colStart = new Int32Array(nx * nz + 1);
  const ys: number[] = [];
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      for (const h of columnFloors(grid, x, z, o)) ys.push(h);
      colStart[x + nx * z + 1] = ys.length;
    }
  }
  return { colStart, nodeY: Float32Array.from(ys) };
}

/** True if a jump arc from a to b (world metres) stays clear of terrain. */
function arcClear(grid: SdfGrid, a: Vec3, b: Vec3): boolean {
  const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (grid.cellSize * 0.5)));
  const lift = Math.min(JUMP_APEX * 0.6, 0.5 + Math.abs(b.y - a.y));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const y = a.y + (b.y - a.y) * t + 0.55 + lift * Math.sin(Math.PI * t) * 0.5;
    if (grid.sampleLinear({ x: a.x + (b.x - a.x) * t, y, z: a.z + (b.z - a.z) * t }) < 0.3) {
      return false;
    }
  }
  return true;
}

/** Largest rise a jump clears over horizontal gap `d` (negative: not jumpable at all). */
function jumpRiseAt(d: number, o: ReachabilityOptions): number {
  if (d <= 1) return o.jumpRise;
  if (d > o.jumpGap) return -1;
  return o.jumpRise * (1 - (d - 1) / Math.max(1e-6, o.jumpGap - 1));
}

/**
 * Analyses which standable surface is mutually reachable by crawling, stepping and jumping.
 * Edges are symmetric on purpose: anything a snail can climb it can also come back down, so a
 * plateau it could only drop onto counts as separate. Pure and deterministic.
 */
export function analyzeReachability(
  grid: SdfGrid,
  waterLevel: number,
  options: Partial<ReachabilityOptions> = {},
): ReachabilityMap {
  const o = { ...defaultReachabilityOptions(waterLevel), ...options };
  const { nx, nz, cellSize: cs } = grid;
  const { colStart, nodeY } = collectNodes(grid, o);
  const count = nodeY.length;
  const uf = new UnionFind(count);
  const at = (x: number, z: number): Vec3 => ({ x: x * cs, y: 0, z: z * cs });
  const edges = (
    reach: number,
    maxD: number,
    link: (i: number, j: number, d: number) => boolean,
  ): void => {
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const c = x + nx * z;
        if (colStart[c] === colStart[c + 1]) continue;
        for (let dz = 0; dz <= reach; dz++) {
          for (let dx = dz === 0 ? 1 : -reach; dx <= reach; dx++) {
            const x2 = x + dx;
            const z2 = z + dz;
            if (x2 < 0 || z2 >= nz || x2 >= nx) continue;
            const d = Math.hypot(dx, dz) * cs;
            if (d > maxD) continue;
            const c2 = x2 + nx * z2;
            if (colStart[c2] === colStart[c2 + 1]) continue;
            for (let i = colStart[c] as number; i < (colStart[c + 1] as number); i++) {
              for (let j = colStart[c2] as number; j < (colStart[c2 + 1] as number); j++) {
                if (uf.find(i) !== uf.find(j) && link(i, j, d)) uf.union(i, j);
              }
            }
          }
        }
      }
    }
  };
  edges(
    1,
    2 * cs,
    (i, j, d) => Math.abs((nodeY[i] as number) - (nodeY[j] as number)) <= o.crawlGrade * d,
  );
  // Jump edges need the column coordinates of a node: rebuild them from the CSR index.
  const colOf = new Int32Array(count);
  for (let c = 0; c < nx * nz; c++) {
    colOf.fill(c, colStart[c] as number, colStart[c + 1] as number);
  }
  const reach = Math.ceil(o.jumpGap / cs);
  edges(reach, o.jumpGap, (i, j, d) => {
    const rise = Math.abs((nodeY[i] as number) - (nodeY[j] as number));
    if (rise > jumpRiseAt(d, o)) return false;
    const ci = colOf[i] as number;
    const cj = colOf[j] as number;
    const a = at(ci % nx, Math.floor(ci / nx));
    const b = at(cj % nx, Math.floor(cj / nx));
    return arcClear(grid, { ...a, y: nodeY[i] as number }, { ...b, y: nodeY[j] as number });
  });
  return labelComponents(uf, count, nx, nz, cs, colStart, nodeY);
}

/** Densely numbers the union-find roots and sums component areas. */
function labelComponents(
  uf: UnionFind,
  count: number,
  nx: number,
  nz: number,
  cellSize: number,
  colStart: Int32Array,
  nodeY: Float32Array,
): ReachabilityMap {
  const comp = new Int32Array(count);
  const ids = new Map<number, number>();
  const area: number[] = [];
  for (let i = 0; i < count; i++) {
    const r = uf.find(i);
    let id = ids.get(r);
    if (id === undefined) {
      id = ids.size;
      ids.set(r, id);
      area.push(0);
    }
    comp[i] = id;
    area[id] = (area[id] as number) + cellSize * cellSize;
  }
  return { nx, nz, cellSize, count, colStart, nodeY, comp, compArea: Float64Array.from(area) };
}

/** Result of {@link reachableFraction}. */
export interface ReachSummary {
  /** Total standable area (m^2). */
  total: number;
  /** Area reachable from the start points (m^2). */
  reachable: number;
  /** `reachable / total` (1 when there is no standable ground). */
  fraction: number;
  /** Components of at least `minArea` that the starts cannot reach, as `{ area, x, y, z }`. */
  stranded: { area: number; x: number; y: number; z: number }[];
}

/** Component ids a set of world points stand in (the nearest node of each point's column). */
export function startComponents(map: ReachabilityMap, points: readonly Vec3[]): Set<number> {
  const out = new Set<number>();
  const cs = map.cellSize;
  for (const p of points) {
    const cx = Math.round(p.x / cs);
    const cz = Math.round(p.z / cs);
    let best = -1;
    for (let r = 0; r <= 2 && best < 0; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const n = nodeNear(map, cx + dx, cz + dz, p.y);
          if (n >= 0 && Math.abs((map.nodeY[n] as number) - p.y) < 1 && best < 0) best = n;
        }
      }
    }
    if (best >= 0) out.add(map.comp[best] as number);
  }
  return out;
}

/** Summarises how much standable area the start points can reach; `minArea` filters `stranded`. */
export function reachableFraction(
  map: ReachabilityMap,
  starts: ReadonlySet<number>,
  minArea = 2,
): ReachSummary {
  let total = 0;
  let reachable = 0;
  const first = new Map<number, number>();
  for (let i = 0; i < map.count; i++) {
    const c = map.comp[i] as number;
    if (!first.has(c)) first.set(c, i);
  }
  const stranded: ReachSummary['stranded'] = [];
  map.compArea.forEach((a, c) => {
    total += a;
    if (starts.has(c)) reachable += a;
    else if (a >= minArea) {
      const i = first.get(c) as number;
      let col = 0;
      while ((map.colStart[col + 1] as number) <= i) col++;
      stranded.push({
        area: a,
        x: (col % map.nx) * map.cellSize,
        y: map.nodeY[i] as number,
        z: Math.floor(col / map.nx) * map.cellSize,
      });
    }
  });
  return { total, reachable, fraction: total > 0 ? reachable / total : 1, stranded };
}

/** Standable surface heights of column (x, z) of a grid, with the options' headroom and slope. */
function floorsAt(grid: SdfGrid, x: number, z: number, o: ReachabilityOptions): number[] {
  return x < 0 || z < 0 || x >= grid.nx || z >= grid.nz ? [] : columnFloors(grid, x, z, o);
}

/**
 * True if the ground at world point `p` belongs to a connected standable region of at least
 * `minArea` m^2 (by the same crawl, step and jump rules as {@link analyzeReachability}). A local
 * flood fill that stops as soon as the area is reached, so it is cheap on open ground; use it
 * to keep drops and pickups off islets and ledges that nobody can walk to.
 */
export function groundIsOpen(grid: SdfGrid, waterLevel: number, p: Vec3, minArea = 60): boolean {
  const o = defaultReachabilityOptions(waterLevel);
  const cs = grid.cellSize;
  const cache = new Map<number, number[]>();
  const column = (x: number, z: number): number[] => {
    const key = x + grid.nx * z;
    let c = cache.get(key);
    if (!c) cache.set(key, (c = floorsAt(grid, x, z, o)));
    return c;
  };
  const sx = Math.round(p.x / cs);
  const sz = Math.round(p.z / cs);
  const start = column(sx, sz).findIndex((h) => Math.abs(h - p.y) < 1);
  if (start < 0) return false;
  const seen = new Set<string>([`${sx},${sz},${start}`]);
  const queue: [number, number, number][] = [[sx, sz, start]];
  const need = Math.ceil(minArea / (cs * cs));
  const reach = Math.ceil(o.jumpGap / cs);
  for (let head = 0; head < queue.length; head++) {
    if (queue.length >= need) return true;
    const [x, z, i] = queue[head] as [number, number, number];
    const ya = column(x, z)[i] as number;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.hypot(dx, dz) * cs;
        if ((dx === 0 && dz === 0) || d > o.jumpGap) continue;
        column(x + dx, z + dz).forEach((yb, j) => {
          const key = `${x + dx},${z + dz},${j}`;
          if (
            seen.has(key) ||
            !canStep(grid, o, { x, z, y: ya }, { x: x + dx, z: z + dz, y: yb }, d)
          ) {
            return;
          }
          seen.add(key);
          queue.push([x + dx, z + dz, j]);
        });
      }
    }
  }
  return queue.length >= need;
}

/** True if a snail can walk or jump from ground point a to b (cells, cells, metres), d metres apart. */
function canStep(
  grid: SdfGrid,
  o: ReachabilityOptions,
  a: { x: number; z: number; y: number },
  b: { x: number; z: number; y: number },
  d: number,
): boolean {
  const rise = Math.abs(b.y - a.y);
  if (d < 1.5 * grid.cellSize && rise <= o.crawlGrade * d) return true;
  if (rise > jumpRiseAt(d, o)) return false;
  const cs = grid.cellSize;
  return arcClear(grid, { x: a.x * cs, y: a.y, z: a.z * cs }, { x: b.x * cs, y: b.y, z: b.z * cs });
}
