import type { Rng } from '../../rng.js';
import { MATERIAL_ROCK, MATERIAL_SAND } from '../materials.js';
import type { ValueNoise } from '../noise.js';
import { archDistance, nearRock, stackDistance, type Arch, type Stack } from './coast.js';
import { extraFeatures, smoothstep as smooth } from './shared.js';
import type { StyleConfig, StyleField, TerrainStyleImpl } from './types.js';

/** Metres the sea floor lies below the water surface. */
const SEA_DEPTH = 2.5;

interface Island {
  x: number;
  z: number;
  r: number;
  /** Peak height above the waterline (m). */
  rise: number;
  /** -1 = wide sandy beaches, +1 = rocky cliffs; bias on top of angular noise. */
  bias: number;
}

/** Layout: centre (fraction of the map), radius (fraction of the shorter side), rise (m), bias. */
const LAYOUT: readonly (readonly [number, number, number, number, number])[] = [
  [0.4, 0.45, 0.245, 8.5, -0.45],
  [0.8, 0.28, 0.11, 5.5, 0.6],
  [0.72, 0.78, 0.125, 6, -0.9],
  [0.17, 0.8, 0.095, 5, 0.25],
  [0.12, 0.16, 0.075, 4.5, -0.7],
];

/** 4 or 5 jittered islands, in cell units. */
function makeIslands(c: StyleConfig, rng: Rng): Island[] {
  const w = Math.min(c.nx, c.nz);
  const count = 4 + rng.int(0, 1);
  const out: Island[] = [];
  for (let i = 0; i < count; i++) {
    const [fx, fz, fr, rise, bias] = LAYOUT[i] as (typeof LAYOUT)[number];
    out.push({
      x: (fx + rng.range(-0.025, 0.025)) * c.nx,
      z: (fz + rng.range(-0.025, 0.025)) * c.nz,
      r: fr * w * rng.range(0.93, 1.07),
      rise,
      bias,
    });
  }
  // Bigger maps get more islands, scattered with a margin so the sea ring stays at the edges.
  for (let i = 0, n = extraFeatures(c.nx, c.nz, 5); i < n; i++) {
    const r = w * rng.range(0.06, 0.1);
    out.push({
      x: rng.range(0.1, 0.9) * c.nx,
      z: rng.range(0.1, 0.9) * c.nz,
      r,
      rise: rng.range(4, 7),
      bias: rng.range(-0.9, 0.7),
    });
  }
  return out;
}

/** Distance (cells) from a point to the segment between two island centres. */
function segDist(px: number, pz: number, a: Island, b: Island): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.min(1, Math.max(0, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t);
}

/** Tall rock pillars: some alone, some clustered next to a taller sibling. */
function makeStacks(c: StyleConfig, isl: Island[], rng: Rng): Stack[] {
  const out: Stack[] = [];
  // Pillar sizes stay those of the original 96 cell map: bigger maps get more, not fatter, pillars.
  const w = 96;
  const add = (x: number, z: number, rf: number, height: number): void => {
    const top = c.waterLevel + height;
    out.push({
      x,
      z,
      r: w * rf,
      top,
      leanX: rng.range(-0.05, 0.05),
      leanZ: rng.range(-0.05, 0.05),
      phase1: rng.range(0, 6.3),
      phase2: rng.range(0, 6.3),
      ledge1: c.waterLevel + height * rng.range(0.35, 0.5),
      ledge2: c.waterLevel + height * rng.range(0.65, 0.8),
    });
  };
  const place = (i: number, ang: number, gap: number, height: number, mates: number): void => {
    const s = isl[i] as Island;
    const d = s.r * (1.04 + gap);
    const x = s.x + Math.cos(ang) * d;
    const z = s.z + Math.sin(ang) * d;
    const rf = rng.range(0.016, 0.024);
    add(x, z, rf, height);
    for (let m = 0; m < mates; m++) {
      const a = rng.range(0, 6.3);
      add(
        x + Math.cos(a) * w * 0.05,
        z + Math.sin(a) * w * 0.05,
        rf * 0.7,
        height * rng.range(0.45, 0.7),
      );
    }
  };
  place(0, rng.range(2.6, 3.6), 0.18, rng.range(8, 11), 2);
  place(0, rng.range(-1.5, -0.9), 0.22, rng.range(6, 8), 0);
  place(1, rng.range(3.2, 4.2), 0.25, rng.range(7, 10), 1);
  place(2, rng.range(4.0, 5.0), 0.2, rng.range(5, 7), 0);
  return out.filter((s) => s.x > 5 && s.z > 5 && s.x < c.nx - 6 && s.z < c.nz - 6);
}

/** A bent rock arch over the shallows at the big island's shore: one foot ashore, one in the sea. */
function makeArch(c: StyleConfig, big: Island, rng: Rng): Arch {
  const ang = rng.range(0.1, 0.7);
  const cs = c.cellSize;
  return {
    x: (big.x + Math.cos(ang) * big.r * 1.0) * cs,
    z: (big.z + Math.sin(ang) * big.r * 1.0) * cs,
    ux: Math.cos(ang),
    uz: Math.sin(ang),
    ring: 4,
    tube: 1.45,
    y0: c.waterLevel - 0.2,
    phase: rng.range(0, 6.3),
  };
}

/** Height (m) of an island column given the inland coordinate `f` (0 = shore) and shore type. */
function profile(c: StyleConfig, f: number, cliff: number, top: number): number {
  const sea = c.waterLevel - SEA_DEPTH;
  const wl = c.waterLevel;
  const beach =
    sea + smooth(0, 0.42, f) * (wl + 0.7 - sea) + smooth(0.36, 0.95, f) * (top - wl - 0.7);
  const rock =
    sea + smooth(0, 0.07, f) * (wl + 3.2 - sea) + smooth(0.05, 0.5, f) * (top - wl - 3.2);
  return beach + (rock - beach) * smooth(-0.2, 0.3, cliff);
}

/** Per-column tables: ground height (m) and shore character (negative = beach, positive = cliff). */
interface Columns {
  height: Float32Array;
  cliff: Float32Array;
}

/** Height of the column's shallow sandbar ridge along a channel (m), or `sea` if none. */
function sandbar(c: StyleConfig, noise: ValueNoise, isl: Island[], x: number, z: number): number {
  const hf = c.cellSize * c.hillFrequency;
  const sea = c.waterLevel - SEA_DEPTH;
  const wid = Math.min(c.nx, c.nz) * 0.05;
  const gap = noise.fbm2(x * hf * 1.5 + 90, z * hf * 1.5, 2) > -0.15 ? 1 : 0;
  const top = c.waterLevel - 0.55 + noise.fbm2(x * hf * 2, z * hf * 2 + 5, 2) * 0.4;
  let best = sea;
  for (const [a, b] of [
    [0, 1],
    [1, 2],
  ] as const) {
    const s = isl[a];
    const e = isl[b];
    if (!s || !e) continue;
    best = Math.max(best, sea + gap * smooth(0, 0.7, 1 - segDist(x, z, s, e) / wid) * (top - sea));
  }
  return best;
}

/** Box-blurs a table in place (3x3, `passes` times) to round off spurs and sharp creases. */
function blur(t: Float32Array, nx: number, nz: number, passes: number): void {
  const tmp = new Float32Array(t.length);
  for (let p = 0; p < passes; p++) {
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        let sum = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(nx - 1, Math.max(0, x + dx));
            const zz = Math.min(nz - 1, Math.max(0, z + dz));
            sum += t[zz * nx + xx] as number;
          }
        }
        tmp[z * nx + x] = sum / 9;
      }
    }
    t.set(tmp);
  }
}

/** Builds the height and cliff tables for the whole map. */
function buildColumns(c: StyleConfig, noise: ValueNoise, isl: Island[]): Columns {
  const hf = c.cellSize * c.hillFrequency;
  const height = new Float32Array(c.nx * c.nz);
  const cliff = new Float32Array(c.nx * c.nz);
  for (let z = 0; z < c.nz; z++) {
    for (let x = 0; x < c.nx; x++) {
      const warp = 0.15 * noise.fbm2(x * hf * 1.1 + 40, z * hf * 1.1 - 7, 2);
      let best = -1;
      let h = c.waterLevel - SEA_DEPTH;
      let ch = 0;
      for (const s of isl) {
        const f = 1 - Math.hypot(x - s.x, z - s.z) / s.r + warp;
        if (f <= best) continue;
        best = f;
        const hills = 0.25 + 0.95 * smooth(-0.5, 0.5, noise.fbm2(x * hf * 1.3, z * hf * 1.3, 3));
        ch = s.bias + 1.3 * noise.fbm2(x * hf * 0.5 + 200, z * hf * 0.5 - 60, 2);
        h = profile(c, f, ch, c.waterLevel + 1.2 + s.rise * hills * 0.9);
      }
      height[z * c.nx + x] = Math.max(h, sandbar(c, noise, isl, x, z));
      cliff[z * c.nx + x] = ch;
    }
  }
  blur(height, c.nx, c.nz, 2);
  blur(cliff, c.nx, c.nz, 2);
  return { height, cliff };
}

/** An archipelago: 4-5 islands split by narrow channels, with beaches, cliffs, bars, stacks, an arch. */
export const archipelagoStyle: TerrainStyleImpl = {
  prepare(c, noise, rng): StyleField {
    const isl = makeIslands(c, rng);
    const stacks = makeStacks(c, isl, rng);
    const arch = makeArch(c, isl[0] as Island, rng);
    const cols = buildColumns(c, noise, isl);
    const cs = c.cellSize;
    const col = (x: number, z: number): number => Math.round(z) * c.nx + Math.round(x);
    return {
      surface: (x, z) => cols.height[col(x, z)] as number,
      add(x, y, z) {
        let v = archDistance(arch, cs, x, y, z);
        for (const s of stacks) v = Math.min(v, stackDistance(s, cs, x, y, z));
        return v;
      },
      material(x, y, z, h) {
        if (nearRock(stacks, arch, cs, x, y, z)) return MATERIAL_ROCK;
        const depth = h - y * cs;
        const ch = cols.cliff[col(x, z)] as number;
        if (ch > 0.3 && h > c.waterLevel - 0.5 && depth > 0.9) return MATERIAL_ROCK;
        if (ch < 0.1 && h < c.waterLevel + 2.2 && depth < 2.5) return MATERIAL_SAND;
        return undefined;
      },
    };
  },
};
