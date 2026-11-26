import { applyRamp, extractBox, type RampSpec } from './ramp.js';
import {
  analyzeReachability,
  columnNodes,
  nodeNear,
  type ReachabilityMap,
} from './reachability.js';
import type { SdfGrid } from './sdf-grid.js';

/** Standable regions smaller than this (m^2) are ignored: pebbles, ledge slivers. */
export const MIN_REGION_AREA = 8;
/** Steepest ramp grade (rise per metre) the generator cuts: about 29 degrees. */
const GRADE = 0.55;
/** Half the flat width of a generated ramp (m). */
const HALF_WIDTH = 1.2;
/** Connect-and-recheck passes before leftovers are removed. */
const MAX_ROUNDS = 6;
/** Search radius for the nearest reachable ground (cells). */
const SEARCH_CELLS = 70;
/** Nodes of a region used as ramp starting points. */
const SAMPLE = 40;
/** Distinct ramp sites tried per region. */
const SITES = 6;
const SITES_BIG = 14;
/** Margin (cells) around a ramp kept in the trial grid. */
const TRIAL_MARGIN = 7;
/** Ramp shapes tried per region before giving up on it this pass: small regions, big regions. */
const MAX_TRIALS = 14;
const MAX_TRIALS_BIG = 150;
/** Direction offsets (in eighths of a half turn) tried for ramps that must run past the low end. */
const TURNS = [0, 2, -2, 4, -4, 6, -6, 8];
const TURNS_BIG = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8];
/** Regions at least this big (m^2) get more attempts and are never dug out. */
const BIG_REGION = 30;

/** A possible ramp between node `a` of a stranded region and node `b` of reachable ground. */
interface Site {
  a: number;
  b: number;
  cost: number;
}

/** Everything the connector needs about one analysed grid. */
interface Ctx {
  grid: SdfGrid;
  waterLevel: number;
  map: ReachabilityMap;
  /** Column index of every node. */
  colOf: Int32Array;
}

function makeCtx(grid: SdfGrid, waterLevel: number): Ctx {
  const map = analyzeReachability(grid, waterLevel);
  const colOf = new Int32Array(map.count);
  for (let c = 0; c < map.nx * map.nz; c++) {
    colOf.fill(c, map.colStart[c] as number, map.colStart[c + 1] as number);
  }
  return { grid, waterLevel, map, colOf };
}

/** Cost of a ramp between two nodes: run length needed for the rise (a longer run if steep). */
function rampCost(d: number, dy: number): number {
  const need = dy / GRADE;
  return d >= need ? d : need + 0.3;
}

/** Best ramp sites from a region's nodes to any node flagged in `isTarget`, cheapest first. */
function findSites(ctx: Ctx, nodes: readonly number[], isTarget: Uint8Array, keep: number): Site[] {
  const { map, colOf } = ctx;
  const { nx, nz, cellSize: cs } = map;
  const stride = Math.max(1, Math.floor(nodes.length / SAMPLE));
  const found: Site[] = [];
  let best = Infinity;
  for (let k = 0; k < nodes.length; k += stride) {
    const a = nodes[k] as number;
    const ax = (colOf[a] as number) % nx;
    const az = Math.floor((colOf[a] as number) / nx);
    const ya = map.nodeY[a] as number;
    for (let r = 0; r <= SEARCH_CELLS && r * cs <= best; r++) {
      for (let dz = -r; dz <= r; dz++) {
        const z = az + dz;
        if (z < 0 || z >= nz) continue;
        const step = Math.abs(dz) === r ? 1 : 2 * r;
        for (let dx = -r; dx <= r; dx += Math.max(1, step)) {
          const x = ax + dx;
          if (x < 0 || x >= nx) continue;
          const [from, to] = columnNodes(map, x, z);
          for (let b = from; b < to; b++) {
            if (!isTarget[map.comp[b] as number]) continue;
            const cost = rampCost(Math.hypot(dx, dz) * cs, Math.abs((map.nodeY[b] as number) - ya));
            if (cost < best * 1.6 + 2) found.push({ a, b, cost });
            best = Math.min(best, cost);
          }
        }
      }
    }
  }
  return pickSites(ctx, found, keep);
}

/** Cheapest sites that are not near-duplicates of each other. */
function pickSites(ctx: Ctx, found: Site[], keep: number): Site[] {
  found.sort((p, q) => p.cost - q.cost || p.a - q.a || p.b - q.b);
  const nx = ctx.map.nx;
  const near = (i: number, j: number): boolean => {
    const ci = ctx.colOf[i] as number;
    const cj = ctx.colOf[j] as number;
    return Math.hypot((ci % nx) - (cj % nx), Math.floor(ci / nx) - Math.floor(cj / nx)) < 6;
  };
  const out: Site[] = [];
  for (const s of found) {
    if (out.some((o) => near(o.a, s.a) && near(o.b, s.b))) continue;
    out.push(s);
    if (out.length >= keep) break;
  }
  return out;
}

/** World position (m) of a node. */
function nodePos(ctx: Ctx, n: number): { x: number; y: number; z: number } {
  const c = ctx.colOf[n] as number;
  const cs = ctx.map.cellSize;
  return {
    x: (c % ctx.map.nx) * cs,
    y: ctx.map.nodeY[n] as number,
    z: Math.floor(c / ctx.map.nx) * cs,
  };
}

/** True if reachable or stranded ground lies near the low end of a ramp, at about its height. */
function endsOnGround(ctx: Ctx, r: RampSpec, own: number, isTarget: Uint8Array): boolean {
  const { map } = ctx;
  const cx = Math.round(r.ex / map.cellSize);
  const cz = Math.round(r.ez / map.cellSize);
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx;
      const z = cz + dz;
      if (x < 0 || z < 0 || x >= map.nx || z >= map.nz) continue;
      const [from, to] = columnNodes(map, x, z);
      for (let n = from; n < to; n++) {
        const c = map.comp[n] as number;
        if ((c === own || isTarget[c]) && Math.abs((map.nodeY[n] as number) - r.ey) < 0.8)
          return true;
      }
    }
  }
  return false;
}

/** Ramp specs for a site: straight when the run is long enough, else running past the low end. */
function rampVariants(ctx: Ctx, s: Site, turns: readonly number[]): RampSpec[] {
  const pa = nodePos(ctx, s.a);
  const pb = nodePos(ctx, s.b);
  const [hi, lo] = pa.y >= pb.y ? [pa, pb] : [pb, pa];
  const d = Math.hypot(lo.x - hi.x, lo.z - hi.z);
  const need = (hi.y - lo.y) / GRADE;
  const base = { halfWidth: HALF_WIDTH, waterLevel: ctx.waterLevel, sx: hi.x, sy: hi.y, sz: hi.z };
  if (d >= need) return [{ ...base, ex: lo.x, ey: lo.y, ez: lo.z }];
  const theta = d > 0.3 ? Math.atan2(lo.z - hi.z, lo.x - hi.x) : 0;
  return turns.map((k) => ({
    ...base,
    ex: hi.x + Math.cos(theta + (k * Math.PI) / 8) * need,
    ez: hi.z + Math.sin(theta + (k * Math.PI) / 8) * need,
    ey: lo.y,
  }));
}

/** Cell box (clipped to the grid) holding both ramp ends and both site nodes, plus a margin. */
function trialBox(ctx: Ctx, r: RampSpec, s: Site): [number, number, number, number] {
  const cs = ctx.map.cellSize;
  const pa = nodePos(ctx, s.a);
  const pb = nodePos(ctx, s.b);
  const xs = [r.sx, r.ex, pa.x, pb.x].map((v) => v / cs);
  const zs = [r.sz, r.ez, pa.z, pb.z].map((v) => v / cs);
  return [
    Math.max(0, Math.floor(Math.min(...xs)) - TRIAL_MARGIN),
    Math.min(ctx.grid.nx - 1, Math.ceil(Math.max(...xs)) + TRIAL_MARGIN),
    Math.max(0, Math.floor(Math.min(...zs)) - TRIAL_MARGIN),
    Math.min(ctx.grid.nz - 1, Math.ceil(Math.max(...zs)) + TRIAL_MARGIN),
  ];
}

/** Sub-map node at the same column and (nearly) the same height as node `n` of `from`, or -1. */
function sameNode(
  from: ReachabilityMap,
  n: number,
  colX: number,
  colZ: number,
  to: ReachabilityMap,
): number {
  const m = nodeNear(to, colX, colZ, from.nodeY[n] as number);
  return m >= 0 && Math.abs((to.nodeY[m] as number) - (from.nodeY[n] as number)) <= 0.2 ? m : -1;
}

/** Node of a sub-map at world column (x, z) and height near `y`, or -1. */
function nodeAt(m: ReachabilityMap, x: number, z: number, y: number): number {
  const n = nodeNear(m, x, z, y);
  return n >= 0 && Math.abs((m.nodeY[n] as number) - y) <= 0.3 ? n : -1;
}

/** Nodes of each untouched-box region that ended up outside that region's biggest surviving part. */
function splitNodes(before: ReachabilityMap, after: ReachabilityMap, skip: number): number {
  const parts = new Map<number, Map<number, number>>();
  for (let z = 0; z < before.nz; z++) {
    for (let x = 0; x < before.nx; x++) {
      const [from, to] = columnNodes(before, x, z);
      for (let n = from; n < to; n++) {
        const b = before.comp[n] as number;
        const m = sameNode(before, n, x, z, after);
        if (m < 0 || b === skip) continue;
        const counts = parts.get(b) ?? new Map<number, number>();
        const c = after.comp[m] as number;
        counts.set(c, (counts.get(c) ?? 0) + 1);
        parts.set(b, counts);
      }
    }
  }
  let lost = 0;
  for (const counts of parts.values()) {
    const all = [...counts.values()];
    lost += all.reduce((p, q) => p + q, 0) - Math.max(...all);
  }
  return lost;
}

/** Nodes a ramp may cut off from their own region before it is rejected (about 4 m^2). */
const MAX_SPLIT = 16;
/** Share of the target's local ground that must stay in one piece with the stranded region. */
const KEEP_SHARE = 0.85;

/** Share of baseline region `bc` that survives in the single after-region holding node `an`. */
function keptShare(
  before: ReachabilityMap,
  bc: number,
  after: ReachabilityMap,
  an: number,
): number {
  let all = 0;
  let kept = 0;
  for (let z = 0; z < before.nz; z++) {
    for (let x = 0; x < before.nx; x++) {
      const [from, to] = columnNodes(before, x, z);
      for (let n = from; n < to; n++) {
        if (before.comp[n] !== bc) continue;
        const m = sameNode(before, n, x, z, after);
        if (m < 0) continue;
        all++;
        if (after.comp[m] === after.comp[an]) kept++;
      }
    }
  }
  return all > 0 ? kept / all : 0;
}

/** True if sub-map region `c` holds ground of the stranded region that node `a` belongs to. */
function holdsRegion(
  ctx: Ctx,
  tm: ReachabilityMap,
  c: number,
  x0: number,
  z0: number,
  a: number,
): boolean {
  const own = ctx.map.comp[a];
  for (let z = 0; z < tm.nz; z++) {
    for (let x = 0; x < tm.nx; x++) {
      const [from, to] = columnNodes(tm, x, z);
      for (let n = from; n < to; n++) {
        if (tm.comp[n] !== c) continue;
        const o = sameNode(tm, n, x + x0, z + z0, ctx.map);
        if (o >= 0 && ctx.map.comp[o] === own) return true;
      }
    }
  }
  return false;
}

/**
 * Applies the ramp to a copy of the surrounding box and checks that, afterwards, the stranded
 * ground (site node `a`) and nearly all of the reachable ground it meets (site node `b`) form one
 * region, and that the cut did not sever other ground from its own region.
 */
function rampWorks(ctx: Ctx, r: RampSpec, s: Site): boolean {
  const [x0, x1, z0, z1] = trialBox(ctx, r, s);
  const base = extractBox(ctx.grid, x0, x1, z0, z1);
  const trial = base.clone();
  applyRamp(trial, r, x0, z0);
  const tm = analyzeReachability(trial, ctx.waterLevel);
  const at = (n: number, m: ReachabilityMap): number => {
    const c = ctx.colOf[n] as number;
    return nodeAt(
      m,
      (c % ctx.map.nx) - x0,
      Math.floor(c / ctx.map.nx) - z0,
      ctx.map.nodeY[n] as number,
    );
  };
  const tb = at(s.b, tm);
  if (tb < 0 || !holdsRegion(ctx, tm, tm.comp[tb] as number, x0, z0, s.a)) return false;
  const bm = analyzeReachability(base, ctx.waterLevel);
  const bb = at(s.b, bm);
  if (bb < 0) return false;
  if (keptShare(bm, bm.comp[bb] as number, tm, tb) < KEEP_SHARE) return false;
  return splitNodes(bm, tm, bm.comp[bb] as number) <= MAX_SPLIT;
}

/** Clearance (m) kept between two ramps cut in the same pass, so the one cannot undo the other. */
const RAMP_SPACING = 5;

/** Distance (m, ground plane) from point (px, pz) to a ramp's centre line. */
function distanceToRamp(r: RampSpec, px: number, pz: number): number {
  const dx = r.ex - r.sx;
  const dz = r.ez - r.sz;
  const t = Math.min(
    1,
    Math.max(0, ((px - r.sx) * dx + (pz - r.sz) * dz) / Math.max(1e-9, dx * dx + dz * dz)),
  );
  return Math.hypot(px - (r.sx + dx * t), pz - (r.sz + dz * t));
}

/** True if two ramps come within {@link RAMP_SPACING} of each other (sampled along both). */
function rampsClash(a: RampSpec, b: RampSpec): boolean {
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    if (distanceToRamp(b, a.sx + (a.ex - a.sx) * t, a.sz + (a.ez - a.sz) * t) < RAMP_SPACING)
      return true;
    if (distanceToRamp(a, b.sx + (b.ex - b.sx) * t, b.sz + (b.ez - b.sz) * t) < RAMP_SPACING)
      return true;
  }
  return false;
}

/** Tries the cheapest sites and ramp shapes for one region; commits the first that works. */
function connectRegion(
  ctx: Ctx,
  nodes: readonly number[],
  isTarget: Uint8Array,
  cut: RampSpec[],
  desperate: boolean,
): boolean {
  const big = desperate || nodes.length * ctx.map.cellSize * ctx.map.cellSize >= BIG_REGION;
  const more = desperate ? 3 : 1;
  const maxTrials = (big ? MAX_TRIALS_BIG : MAX_TRIALS) * more;
  const sites = findSites(ctx, nodes, isTarget, (big ? SITES_BIG : SITES) * more);
  let trials = 0;
  for (const site of sites) {
    for (const ramp of rampVariants(ctx, site, big ? TURNS_BIG : TURNS)) {
      if (trials >= maxTrials) return false;
      if (cut.some((c) => rampsClash(c, ramp))) continue;
      if (!desperate && !endsOnGround(ctx, ramp, ctx.map.comp[site.a] as number, isTarget))
        continue;
      trials++;
      if (!rampWorks(ctx, ramp, site)) continue;
      applyRamp(ctx.grid, ramp);
      cut.push(ramp);
      return true;
    }
  }
  return false;
}

/** Digs out (open sky) or fills in (roofed) every column of a region the ramps could not reach. */
function removeRegion(ctx: Ctx, nodes: readonly number[]): void {
  const { grid, map } = ctx;
  const cs = grid.cellSize;
  const band = 4 * cs;
  const low = Math.max(0, Math.floor((ctx.waterLevel - 0.5) / cs));
  for (const n of nodes) {
    const c = ctx.colOf[n] as number;
    const y0 = Math.floor((map.nodeY[n] as number) / cs);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = (c % map.nx) + dx;
        const z = Math.floor(c / map.nx) + dz;
        if (!grid.inBounds(x, y0, z)) continue;
        let roof = -1;
        for (let y = y0 + 1; y < grid.ny && y * cs < y0 * cs + 10; y++) {
          if (grid.get(x, y, z) < 0) {
            roof = y;
            break;
          }
        }
        const [from, to, v] = roof >= 0 ? [y0 + 1, roof - 1, -band] : [low, y0, band];
        for (let y = from; y <= to; y++) grid.data[grid.index(x, y, z)] = v;
      }
    }
  }
}

/** Node ids per region (only regions of at least {@link MIN_REGION_AREA}). */
function regionNodes(map: ReachabilityMap): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (let n = 0; n < map.count; n++) {
    const c = map.comp[n] as number;
    if ((map.compArea[c] as number) < MIN_REGION_AREA) continue;
    const list = out.get(c);
    if (list) list.push(n);
    else out.set(c, [n]);
  }
  return out;
}

/** Largest region by area (lowest id on ties), or -1 if there is none. */
export function largestRegion(map: ReachabilityMap): number {
  let main = -1;
  map.compArea.forEach((a, c) => {
    if (main < 0 || a > (map.compArea[main] as number)) main = c;
  });
  return main;
}

/** What {@link ensureReachable} did. */
export interface ConnectStats {
  /** Ramps, causeways and tunnels cut. */
  ramps: number;
  /** Regions that could not be connected and were dug out or filled in. */
  removed: number;
}

/**
 * Makes every meaningful standable region (at least {@link MIN_REGION_AREA} m^2, above water) of
 * the grid reachable from the largest one by crawling, stepping and jumping: it cuts walkable
 * ramps (embankments, causeways over water, sloped tunnels) from each stranded region to the
 * nearest reachable ground, and digs out or fills in regions it cannot connect. Pure and
 * deterministic: draws no randomness, so server and clients build identical grids. Does not
 * mark chunks dirty.
 */
export function ensureReachable(grid: SdfGrid, waterLevel: number): ConnectStats {
  const stats: ConnectStats = { ramps: 0, removed: 0 };
  let ctx = makeCtx(grid, waterLevel);
  let desperate = false;
  for (let round = 0; ; round++) {
    const main = largestRegion(ctx.map);
    const regions = regionNodes(ctx.map);
    const stranded = [...regions.keys()].filter((c) => c !== main);
    stranded.sort(
      (p, q) => (ctx.map.compArea[q] as number) - (ctx.map.compArea[p] as number) || p - q,
    );
    if (stranded.length === 0) break;
    const isTarget = new Uint8Array(ctx.map.compArea.length);
    isTarget[main] = 1;
    const cut: RampSpec[] = [];
    const left: number[] = [];
    for (const c of stranded) {
      const nodes = regions.get(c) as number[];
      if (round < MAX_ROUNDS && connectRegion(ctx, nodes, isTarget, cut, desperate))
        isTarget[c] = 1;
      else left.push(c);
    }
    stats.ramps += cut.length;
    if (cut.length > 0 && round < MAX_ROUNDS) {
      ctx = makeCtx(grid, waterLevel);
      continue;
    }
    if (!desperate && round < MAX_ROUNDS) {
      desperate = true;
      continue;
    }
    // Nothing more can be connected: dig out or fill in the small leftovers, then look again.
    const small = left.filter((c) => (ctx.map.compArea[c] as number) < BIG_REGION);
    if (small.length === 0 || round >= MAX_ROUNDS + 3) break;
    const backup = grid.data.slice();
    const keep = ctx.map.compArea[main] as number;
    for (const c of small) removeRegion(ctx, regions.get(c) as number[]);
    ctx = makeCtx(grid, waterLevel);
    if ((ctx.map.compArea[largestRegion(ctx.map)] as number) < keep * 0.99) {
      // Digging hurt the main ground: put it back and leave the leftovers alone.
      grid.data.set(backup);
      break;
    }
    stats.removed += small.length;
  }
  return stats;
}
