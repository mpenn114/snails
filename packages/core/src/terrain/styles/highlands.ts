import { MATERIAL_ROCK } from '../materials.js';
import type { Rng } from '../../rng.js';
import type { ValueNoise } from '../noise.js';
import { buildTunnel, tunnelCarve, wobblyPath, type Tunnel } from './features.js';
import { SEA_DEPTH, caveCarve } from './island.js';
import { smoothstep as smooth } from './shared.js';
import type { StyleConfig, StyleField, TerrainStyleImpl } from './types.js';

/** Metres kept free below the grid ceiling. */
const CEILING_MARGIN = 4;
/** Height of one terrace step (m). */
const TERRACE = 3.2;
/** Tunnel radius (m). */
const TUNNEL_RADIUS = 1.9;

interface Peak {
  x: number;
  z: number;
  /** Footprint radius (cells). */
  r: number;
  /** Height above the foothills (m). */
  h: number;
}

/** Two peaks (a big and a smaller one) in cell units, leaving a saddle between them. */
function makePeaks(c: StyleConfig, rng: Rng): Peak[] {
  const cx = (c.nx - 1) / 2;
  const cz = (c.nz - 1) / 2;
  const half = Math.min(c.nx, c.nz) / 2;
  const a = rng.range(0, Math.PI * 2);
  const h1 = rng.range(12.5, 13.5);
  const d = half * rng.range(0.42, 0.52);
  return [
    {
      x: cx - Math.cos(a) * d * 0.45,
      z: cz - Math.sin(a) * d * 0.45,
      r: half * 0.5,
      h: h1,
    },
    {
      x: cx + Math.cos(a) * d,
      z: cz + Math.sin(a) * d,
      r: half * 0.4,
      h: h1 * rng.range(0.7, 0.8),
    },
  ];
}

/** Soft staircase of the elevation e (m above water): flat shelves joined by steep risers. */
function terrace(e: number): number {
  const f = e / TERRACE;
  const i = Math.floor(f);
  const stepped = (i + smooth(0.5, 0.92, f - i)) * TERRACE;
  return e + (stepped - e) * 0.6 * smooth(2.5, 6, e);
}

/** Surface height (m) before the column cache. */
function rawHeight(c: StyleConfig, noise: ValueNoise, peaks: Peak[], x: number, z: number): number {
  const hf = c.cellSize * c.hillFrequency;
  const half = Math.min(c.nx, c.nz) / 2;
  const warp = 0.09 * noise.fbm2(x * hf * 0.9 + 40, z * hf * 0.9 - 7, 2);
  const d = Math.hypot((x - (c.nx - 1) / 2) / half, (z - (c.nz - 1) / 2) / half);
  const land = c.islandFalloff ? smooth(0.9, 0.72, d + warp) : 1;
  const sea = c.waterLevel - SEA_DEPTH;
  const hills = noise.fbm2(x * hf * 1.3, z * hf * 1.3, 3);
  const ground = c.waterLevel + 1.8 + 1.3 * hills;
  const rr = 1 - Math.abs(noise.fbm2(x * hf * 2.6 + 5, z * hf * 2.6 + 11, 3));
  const ridge = rr * rr;
  let mt = 0;
  for (const p of peaks) {
    const q = Math.max(0, 1 - Math.hypot(x - p.x, z - p.z) / p.r + 0.12 * warp);
    mt = Math.max(mt, p.h * Math.pow(q, 1.1) * (0.5 + 0.7 * ridge));
  }
  const cap = c.ny * c.cellSize - CEILING_MARGIN;
  const top = Math.min(
    cap,
    c.waterLevel +
      terrace(
        Math.max(
          0,
          ground - c.waterLevel + mt + 1.1 * noise.fbm2(x * hf * 1.9 + 70, z * hf * 1.9, 2),
        ),
      ),
  );
  return sea + land * (top - sea);
}

/** Builds the surface height cache (m) of all columns, row-major (z * nx + x). */
function heightCache(c: StyleConfig, noise: ValueNoise, peaks: Peak[]): Float32Array {
  const out = new Float32Array(c.nx * c.nz);
  for (let z = 0; z < c.nz; z++) {
    for (let x = 0; x < c.nx; x++) out[z * c.nx + x] = rawHeight(c, noise, peaks, x, z);
  }
  return out;
}

/** Bores a tunnel straight through a peak along `angle`, opening on the surface at both ends. */
function boreTunnel(c: StyleConfig, H: Float32Array, p: Peak, angle: number, rng: Rng): Tunnel {
  const cs = c.cellSize;
  const floor = c.waterLevel + rng.range(2.6, 4.4);
  const ground = (x: number, z: number): number => {
    const ix = Math.min(c.nx - 1, Math.max(0, Math.round(x)));
    const iz = Math.min(c.nz - 1, Math.max(0, Math.round(z)));
    return H[iz * c.nx + ix] as number;
  };
  const ends = [0, 1].map((side) => {
    const a = angle + side * Math.PI + rng.range(-0.25, 0.25);
    let r = 2;
    // Walk outward until the ground drops to the tunnel floor, then step a little outside.
    while (r < c.nx + c.nz) {
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      const out = x < 3 || z < 3 || x > c.nx - 4 || z > c.nz - 4;
      if (out || ground(x, z) <= floor + 0.2) break;
      r += 0.5;
    }
    r += 2.5;
    return {
      x: (p.x + Math.cos(a) * r) * cs,
      y: floor + TUNNEL_RADIUS - 0.2,
      z: (p.z + Math.sin(a) * r) * cs,
    };
  });
  const [a, b] = ends as [(typeof ends)[number], (typeof ends)[number]];
  return buildTunnel(
    wobblyPath(rng, a, b, { segments: 10, sideways: 1.6, vertical: 0.5 }),
    TUNNEL_RADIUS,
  );
}

/** Rock on steep or high ground; default strata (sand, soil, clay) on gentle shelves. */
function makeMaterial(c: StyleConfig, H: Float32Array): StyleField['material'] {
  const rocky = new Uint8Array(c.nx * c.nz);
  const at = (x: number, z: number): number =>
    H[Math.min(c.nz - 1, Math.max(0, z)) * c.nx + Math.min(c.nx - 1, Math.max(0, x))] as number;
  for (let z = 0; z < c.nz; z++) {
    for (let x = 0; x < c.nx; x++) {
      const gx = (at(x + 1, z) - at(x - 1, z)) / (2 * c.cellSize);
      const gz = (at(x, z + 1) - at(x, z - 1)) / (2 * c.cellSize);
      const steep = smooth(0.55, 1.1, Math.hypot(gx, gz));
      const high = smooth(c.waterLevel + 9, c.waterLevel + 12, at(x, z));
      rocky[z * c.nx + x] = Math.max(steep, high) > 0.5 ? 1 : 0;
    }
  }
  return (x, _y, z, h) => {
    if (h < c.waterLevel + 1.2) return undefined;
    return rocky[z * c.nx + x] ? MATERIAL_ROCK : undefined;
  };
}

/**
 * A big mountainous island: two ridged, terraced peaks (about 17 to 20 m) with a saddle between
 * them, steep rocky cliffs, flat shelves, foothills and a narrow shore. Tunnels are bored through
 * the peaks' flanks with both mouths on dry ground, plus a few noise caves.
 */
export const highlandsStyle: TerrainStyleImpl = {
  prepare(c, noise, rng): StyleField {
    const peaks = makePeaks(c, rng);
    const H = heightCache(c, noise, peaks);
    const a0 = rng.range(0, Math.PI * 2);
    const tunnels = peaks.map((p, i) => boreTunnel(c, H, p, a0 + i * 1.9, rng));
    const cs = c.cellSize;
    return {
      surface: (x, z) => H[z * c.nx + x] as number,
      carve: (x, y, z, h) => {
        let v = caveCarve(c, noise, x, y, z, h);
        for (const t of tunnels) v = Math.max(v, tunnelCarve(t, x * cs, y * cs, z * cs));
        return v;
      },
      material: makeMaterial(c, H),
    };
  },
};
