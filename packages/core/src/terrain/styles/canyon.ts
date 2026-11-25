import { MATERIAL_CLAY, MATERIAL_ROCK, MATERIAL_SAND, MATERIAL_SOIL } from '../materials.js';
import type { Rng } from '../../rng.js';
import type { ValueNoise } from '../noise.js';
import { segmentDistance, wobblyPath, type Pt } from './features.js';
import { smoothstep as smooth } from './shared.js';
import type { StyleConfig, StyleField, TerrainStyleImpl } from './types.js';

/** Metres the sea floor lies below the water surface. */
const SEA_DEPTH = 2.5;
/** Vertical period (m) of the sediment bands and the thickness (m) of the rock band. */
const BAND_PERIOD = 2.4;
const BAND_ROCK = 1.3;

/** A natural rock bridge across a gorge (metres): axis point, unit direction across, half width. */
interface Bridge {
  x: number;
  z: number;
  /** Unit direction across the gorge. */
  ux: number;
  uz: number;
  /** Half width of the span along the gorge (m). */
  half: number;
  /** Height (m) of the underside at the centre. */
  under: number;
}

/** Per-column data, row-major (z * nx + x). */
interface Columns {
  /** Tableland top (m). */
  top: Float32Array;
  /** Signed horizontal distance (m) to the coast; negative inland. */
  edge: Float32Array;
  /** Horizontal distance (m) to the nearest gorge centre line. */
  gorge: Float32Array;
  /** Gorge floor height (m). */
  floor: Float32Array;
  /** Base half width (m) of the gorge here. */
  half: Float32Array;
  /** Height offsets (m) above the floor of the three ledges. */
  ledge: Float32Array;
  /** Strength (0..1) of the undercut at the foot of the wall. */
  under: Float32Array;
}

/** Shore radius (cells) of the island at angle `a`. */
function shoreRadius(c: StyleConfig, noise: ValueNoise, a: number): number {
  const half = Math.min(c.nx, c.nz) / 2;
  return half * 0.74 * (1 + 0.14 * noise.fbm2(Math.cos(a) * 1.3 + 9, Math.sin(a) * 1.3 + 4, 2));
}

/** Gorge centre lines (metres, y = 0): one across the island and a tributary joining it. */
function makeGorges(c: StyleConfig, noise: ValueNoise, rng: Rng): Pt[][] {
  const cs = c.cellSize;
  const cx = ((c.nx - 1) / 2) * cs;
  const cz = ((c.nz - 1) / 2) * cs;
  const end = (a: number): Pt => {
    const r = (shoreRadius(c, noise, a) + 3.5) * cs;
    return { x: cx + Math.cos(a) * r, y: 0, z: cz + Math.sin(a) * r };
  };
  const a0 = rng.range(0, Math.PI * 2);
  const main = wobblyPath(rng, end(a0), end(a0 + Math.PI + rng.range(-0.3, 0.3)), {
    segments: 10,
    sideways: 4,
    vertical: 0,
  });
  const join = main[rng.int(4, 6)] as Pt;
  const side = rng.range(0, 1) < 0.5 ? 1 : -1;
  const trib = wobblyPath(rng, end(a0 + side * rng.range(1.2, 1.9)), join, {
    segments: 8,
    sideways: 3,
    vertical: 0,
  });
  return [main, trib];
}

/** Bridges: one over each gorge, on a stretch away from the junction. */
function makeBridges(gorges: Pt[][], rng: Rng): Bridge[] {
  return gorges.map((g, i) => {
    const k = i === 0 ? rng.int(2, 3) : rng.int(1, 3);
    const a = g[k] as Pt;
    const b = g[k + 1] as Pt;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return {
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      ux: -(b.z - a.z) / len,
      uz: (b.x - a.x) / len,
      half: rng.range(1.0, 1.4),
      under: rng.range(9.2, 10.2),
    };
  });
}

/** Distance (m, xz plane) from a point to the nearest gorge centre line. */
function gorgeDistance(gorges: Pt[][], x: number, z: number): number {
  let best = Infinity;
  for (const g of gorges) {
    for (let i = 0; i + 1 < g.length; i++) {
      best = Math.min(best, segmentDistance(g[i] as Pt, g[i + 1] as Pt, x, 0, z));
    }
  }
  return best;
}

/** Fills the per-column caches of column (x, z). */
function fillColumn(
  c: StyleConfig,
  noise: ValueNoise,
  gorges: Pt[][],
  col: Columns,
  x: number,
  z: number,
): void {
  const cs = c.cellSize;
  const hf = cs * c.hillFrequency;
  const i = z * c.nx + x;
  const a = Math.atan2(z - (c.nz - 1) / 2, x - (c.nx - 1) / 2);
  const r = Math.hypot(x - (c.nx - 1) / 2, z - (c.nz - 1) / 2);
  col.edge[i] = (r - shoreRadius(c, noise, a)) * cs;
  col.top[i] = 14.3 + 1.1 * noise.fbm2(x * hf * 1.2 + 3, z * hf * 1.2 - 8, 3);
  col.gorge[i] = gorgeDistance(gorges, x * cs, z * cs);
  const inland = smooth(0, 7, -(col.edge[i] as number));
  col.floor[i] =
    c.waterLevel - 0.7 + 1.5 * inland + 0.35 * noise.fbm2(x * hf * 3, z * hf * 3 + 5, 2);
  col.half[i] = 2.8 + 0.9 * noise.fbm2(x * hf * 1.6 + 21, z * hf * 1.6 + 2, 2);
  for (let k = 0; k < 3; k++) {
    const w = noise.fbm2(x * hf * 1.1 + 50 * k, z * hf * 1.1 - 13 * k, 2);
    col.ledge[i * 3 + k] = 2.3 + k * 2.6 + 0.7 * w;
  }
  col.under[i] = smooth(0.0, 0.3, noise.fbm2(x * hf * 1.4 - 30, z * hf * 1.4 + 17, 2));
}

/** Builds every per-column cache. */
function buildColumns(c: StyleConfig, noise: ValueNoise, gorges: Pt[][]): Columns {
  const n = c.nx * c.nz;
  const col: Columns = {
    top: new Float32Array(n),
    edge: new Float32Array(n),
    gorge: new Float32Array(n),
    floor: new Float32Array(n),
    half: new Float32Array(n),
    ledge: new Float32Array(n * 3),
    under: new Float32Array(n),
  };
  for (let z = 0; z < c.nz; z++) {
    for (let x = 0; x < c.nx; x++) fillColumn(c, noise, gorges, col, x, z);
  }
  return col;
}

/** Half width (m) of the gorge in column `i` at height `yy` (m): terraces, undercut, flared rim. */
function wallHalf(col: Columns, i: number, yy: number): number {
  const e = yy - (col.floor[i] as number);
  const u = col.under[i] as number;
  let hw = col.half[i] as number;
  // Undercut at the foot, so the wall above overhangs it.
  hw += 1.7 * u * smooth(0, 0.5, e) * (1 - smooth(1.8, 2.4, e));
  for (let k = 0; k < 3; k++) {
    const L = col.ledge[i * 3 + k] as number;
    hw += 1.15 * (k === 0 ? 1 - u : 1) * smooth(L, L + 0.5, e);
  }
  hw += 0.2 * Math.sin(yy * 1.9 + (col.half[i] as number) * 7);
  return hw + 0.9 * smooth((col.top[i] as number) - 1.8, col.top[i] as number, yy);
}

/** Signed distance of the solid kept by a bridge (negative inside), along `b`. */
function bridgeSolid(b: Bridge, cs: number, x: number, y: number, z: number): number {
  const dx = x * cs - b.x;
  const dz = z * cs - b.z;
  const across = dx * b.ux + dz * b.uz;
  const along = -dx * b.uz + dz * b.ux;
  if (Math.abs(across) > 9 || Math.abs(along) > b.half + 3) return 1e3;
  // Arched underside: high in the middle, curving down to the walls.
  const under = b.under - 0.04 * across * across;
  return Math.max(Math.abs(along) - b.half, under - y * cs);
}

/** Layered sediment: alternating rock and clay bands that wobble gently with position. */
function strata(noise: ValueNoise, cs: number, x: number, yy: number, z: number): number {
  const wob = noise.fbm2(x * cs * 0.07 + 31, z * cs * 0.07 - 17, 2) * 1.6;
  const band = (((yy + wob) % BAND_PERIOD) + BAND_PERIOD) % BAND_PERIOD;
  return band < BAND_ROCK ? MATERIAL_ROCK : MATERIAL_CLAY;
}

/** Carve value (m, positive = void) of column `i` at height `yy`: gorge and stream, minus bridges. */
function gorgeCarve(
  col: Columns,
  bridges: Bridge[],
  cs: number,
  i: number,
  x: number,
  y: number,
  z: number,
): number {
  const d = col.gorge[i] as number;
  if (d > 12) return -1e3;
  const yy = y * cs;
  const hw = wallHalf(col, i, yy);
  const slope = (wallHalf(col, i, yy + 0.25) - wallHalf(col, i, yy - 0.25)) / 0.5;
  const wall = (hw - d) / Math.sqrt(1 + slope * slope);
  const channel = 0.9 * (1 - smooth(0, 2.4, d));
  let v = Math.min(wall, yy - ((col.floor[i] as number) - channel));
  for (const b of bridges) v = Math.min(v, bridgeSolid(b, cs, x, y, z));
  return v;
}

/**
 * A high tableland island cut by a winding gorge and a tributary: steep layered-rock walls with
 * terraces and overhangs, a sandy floor with a shallow stream and rock bridges across the gorges.
 */
export const canyonStyle: TerrainStyleImpl = {
  prepare(c, noise, rng): StyleField {
    const gorges = makeGorges(c, noise, rng);
    const bridges = makeBridges(gorges, rng);
    const col = buildColumns(c, noise, gorges);
    const cs = c.cellSize;
    const sea = c.waterLevel - SEA_DEPTH;
    return {
      surface: (x, z) => {
        const i = z * c.nx + x;
        const beach = 1 - smooth(0, 8, col.edge[i] as number);
        return sea + (c.waterLevel + 0.6 - sea) * beach;
      },
      add: (x, y, z) => {
        const i = z * c.nx + x;
        const yy = y * cs;
        const e = (col.edge[i] as number) - 1.4 * (1 - smooth(6, 8, yy));
        if (e > 3) return 1e3;
        return Math.max(e, yy - (col.top[i] as number));
      },
      carve: (x, y, z) => gorgeCarve(col, bridges, cs, z * c.nx + x, x, y, z),
      material: (x, y, z) => {
        const i = z * c.nx + x;
        const yy = y * cs;
        if ((col.edge[i] as number) > 1.5) return undefined;
        const depth = (col.top[i] as number) - yy;
        if (depth < 0.8) return MATERIAL_SOIL;
        const e = yy - (col.floor[i] as number);
        if (e < 1 && (col.gorge[i] as number) < (col.half[i] as number) + 1.5) return MATERIAL_SAND;
        if (yy < c.waterLevel + 1 && (col.edge[i] as number) > -3) return MATERIAL_SAND;
        return strata(noise, cs, x, yy, z);
      },
    };
  },
};
