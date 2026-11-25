import type { Rng } from '../../rng.js';
import { MATERIAL_ROCK, MATERIAL_SAND } from '../materials.js';
import type { ValueNoise } from '../noise.js';
import {
  archCarve,
  archWallDistance,
  nearRock,
  stackDistance,
  type Arch,
  type Stack,
} from './coast.js';
import { smoothstep as smooth } from './shared.js';
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
  return out;
}

/** Distance (cells) from a point to the segment between two island centres. */
function segDist(px: number, pz: number, a: Island, b: Island): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.min(1, Math.max(0, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t);
}

/** Tall rock pillars: some hugging island shores. */
function makeStacks(c: StyleConfig, isl: Island[], rng: Rng): Stack[] {
  const out: Stack[] = [];
  const w = Math.min(c.nx, c.nz);
  const place = (i: number, ang: number, gap: number): void => {
    const s = isl[i] as Island;
    const d = s.r * (1.02 + gap);
    out.push({
      x: s.x + Math.cos(ang) * d,
      z: s.z + Math.sin(ang) * d,
      r: w * rng.range(0.014, 0.022),
      top: c.waterLevel + rng.range(7, 10),
    });
  };
  place(0, rng.range(2.6, 3.6), 0.18);
  place(0, rng.range(-1.5, -0.9), 0.22);
  place(1, rng.range(3.2, 4.2), 0.25);
  place(2, rng.range(4.0, 5.0), 0.2);
  return out.filter((s) => s.x > 5 && s.z > 5 && s.x < c.nx - 6 && s.z < c.nz - 6);
}

/** A rock arch standing in shallow water just off the big island's shore. */
function makeArch(c: StyleConfig, big: Island, rng: Rng): Arch {
  const w = Math.min(c.nx, c.nz);
  const ang = rng.range(0.1, 0.7);
  const d = big.r * 0.98;
  return {
    x: big.x + Math.cos(ang) * d,
    z: big.z + Math.sin(ang) * d,
    ux: Math.cos(ang),
    uz: Math.sin(ang),
    halfLen: w * 0.05,
    halfThick: w * 0.016,
    top: c.waterLevel + 7,
    openY: c.waterLevel + 0.4,
    openW: w * 0.04,
    openH: 3.3,
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
        const hills = Math.max(0, 0.45 + noise.fbm2(x * hf * 1.6, z * hf * 1.6, 3) * 2.2);
        const ang = Math.atan2(z - s.z, x - s.x);
        ch = s.bias + 1.1 * noise.fbm2(Math.cos(ang) * 2 + s.x, Math.sin(ang) * 2 + s.z, 2);
        h = profile(c, f, ch, c.waterLevel + 1.2 + s.rise * hills * 0.9);
      }
      height[z * c.nx + x] = Math.max(h, sandbar(c, noise, isl, x, z));
      cliff[z * c.nx + x] = ch;
    }
  }
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
        let v = archWallDistance(arch, cs, x, y, z);
        for (const s of stacks) v = Math.min(v, stackDistance(s, cs, x, y, z));
        return v;
      },
      carve: (x, y, z) => archCarve(arch, cs, x, y, z),
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
