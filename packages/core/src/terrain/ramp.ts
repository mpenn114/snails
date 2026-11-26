import { MATERIAL_SAND, MATERIAL_SOIL } from './materials.js';
import { SdfGrid } from './sdf-grid.js';

/** A straight walkable ramp (metres, world space): the ground follows the line from start to end. */
export interface RampSpec {
  sx: number;
  sy: number;
  sz: number;
  ex: number;
  ey: number;
  ez: number;
  /** Half the flat width of the ramp. */
  halfWidth: number;
  /** Surface heights below this get sand, above soil. */
  waterLevel: number;
}

/** Open headroom cut above the ramp surface (m): a tunnel roof is left above it. */
export const RAMP_CLEARANCE = 1.7;
/** Width of the blend between the ramp and the surrounding terrain (m). */
const SHOULDER = 2.5;

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Cell box (inclusive) a ramp can touch, clipped to a grid whose cell (0, 0) sits at world cell (ox, oz). */
function rampBox(
  g: SdfGrid,
  r: RampSpec,
  ox: number,
  oz: number,
): { x0: number; x1: number; z0: number; z1: number } {
  const cs = g.cellSize;
  const m = r.halfWidth + SHOULDER;
  const lo = (a: number, b: number, off: number, n: number): [number, number] => [
    Math.max(0, Math.floor((Math.min(a, b) - m) / cs) - off),
    Math.min(n - 1, Math.ceil((Math.max(a, b) + m) / cs) - off),
  ];
  const [x0, x1] = lo(r.sx, r.ex, ox, g.nx);
  const [z0, z1] = lo(r.sz, r.ez, oz, g.nz);
  return { x0, x1, z0, z1 };
}

/**
 * Cuts and fills a straight ramp into the grid: inside the footprint the ground becomes the
 * ramp line, with {@link RAMP_CLEARANCE} of open air above it (so a ramp through rock is a
 * tunnel and one past a cliff is an embankment). The edge blends into the old terrain.
 * `ox`/`oz` give the world cell of the grid's cell (0, 0), for working on a sub-grid copy.
 * Does not mark chunks dirty.
 */
export function applyRamp(g: SdfGrid, r: RampSpec, ox = 0, oz = 0): void {
  const cs = g.cellSize;
  const band = 4 * cs;
  const dx = r.ex - r.sx;
  const dz = r.ez - r.sz;
  const len2 = Math.max(1e-9, dx * dx + dz * dz);
  const { x0, x1, z0, z1 } = rampBox(g, r, ox, oz);
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const px = (x + ox) * cs - r.sx;
      const pz = (z + oz) * cs - r.sz;
      const t = Math.min(1, Math.max(0, (px * dx + pz * dz) / len2));
      const w =
        1 - smooth(r.halfWidth, r.halfWidth + SHOULDER, Math.hypot(px - dx * t, pz - dz * t));
      if (w <= 0) continue;
      const top = r.sy + (r.ey - r.sy) * t;
      const mat = top < r.waterLevel + 1.2 ? MATERIAL_SAND : MATERIAL_SOIL;
      const yMax = Math.min(g.ny - 2, Math.ceil((top + RAMP_CLEARANCE) / cs));
      for (let y = 0; y <= yMax; y++) {
        const i = g.index(x, y, z);
        const old = g.data[i] as number;
        const target = Math.max(-band, Math.min(band, y * cs - top));
        const v = old + (target - old) * w;
        if (old >= 0 && v < 0) g.materials[i] = mat;
        g.data[i] = v;
      }
    }
  }
}

/** Copy of the cell box [x0, x1] x [z0, z1] (all heights) as its own grid. */
export function extractBox(g: SdfGrid, x0: number, x1: number, z0: number, z1: number): SdfGrid {
  const out = new SdfGrid(x1 - x0 + 1, g.ny, z1 - z0 + 1, g.cellSize);
  for (let z = z0; z <= z1; z++) {
    for (let y = 0; y < g.ny; y++) {
      const from = g.index(x0, y, z);
      const to = out.index(0, y, z - z0);
      out.data.set(g.data.subarray(from, from + out.nx), to);
      out.materials.set(g.materials.subarray(from, from + out.nx), to);
    }
  }
  return out;
}
