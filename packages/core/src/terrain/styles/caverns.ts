import { MATERIAL_ROCK } from '../materials.js';
import type { Rng } from '../../rng.js';
import type { ValueNoise } from '../noise.js';
import { buildTunnel, tunnelCarve, wobblyPath, type Pt, type Tunnel } from './features.js';
import { SEA_DEPTH } from './island.js';
import { smoothstep as smooth } from './shared.js';
import type { StyleConfig, StyleField, TerrainStyleImpl } from './types.js';

/** Height of the mesa top above the water (m). */
const MESA_RISE = 11.5;
/** Height of the shoreline shelf above the water (m). */
const SHELF_RISE = 1;
/** Radius of the connecting tunnels (m). */
const TUNNEL_RADIUS = 1.6;
/** Radius of the skylight shafts (m). */
const SHAFT_RADIUS = 1.3;
/** Metres of soil left on top of the mesa before the rock starts. */
const TOPSOIL = 1.2;

interface Chamber {
  /** Centre in metres. */
  x: number;
  z: number;
  /** Floor height (m). */
  floor: number;
  /** Half widths (m) and dome height (m). */
  rx: number;
  rz: number;
  ry: number;
}

/** The mesa's measurements in metres, derived from the grid. */
interface Layout {
  cx: number;
  cz: number;
  /** Radius where the cliff stands (m). */
  cliff: number;
}

/** Builds the surface height cache (m): flat-topped mesa, cliffs, shelf, sea floor. */
function heightCache(c: StyleConfig, noise: ValueNoise, lay: Layout): Float32Array {
  const out = new Float32Array(c.nx * c.nz);
  const hf = c.cellSize * c.hillFrequency;
  const sea = c.waterLevel - SEA_DEPTH;
  for (let z = 0; z < c.nz; z++) {
    for (let x = 0; x < c.nx; x++) {
      const wx = noise.fbm2(x * hf * 1.1 + 40, z * hf * 1.1 - 7, 2);
      const d =
        Math.hypot(x * c.cellSize - lay.cx, z * c.cellSize - lay.cz) *
        (1 + 0.2 * wx + 0.07 * noise.fbm2(x * hf * 2.7 + 3, z * hf * 2.7 + 21, 2));
      const rim = noise.fbm2(x * hf * 3 + 5, z * hf * 3 + 9, 2);
      const mesa = smooth(lay.cliff + 1.6, lay.cliff - 0.6, d);
      const shelf = smooth(lay.cliff + 6, lay.cliff + 3, d);
      const top = c.waterLevel + MESA_RISE + 0.5 * noise.fbm2(x * hf * 1.5, z * hf * 1.5, 2);
      const low = c.waterLevel + SHELF_RISE + 0.35 * rim;
      const base = sea + shelf * (low - sea);
      out[z * c.nx + x] = c.islandFalloff ? base + mesa * (top - base) : top;
    }
  }
  return out;
}

/** 2-3 domed chambers with flat floors on a ring around the mesa centre. */
function makeChambers(c: StyleConfig, lay: Layout, rng: Rng): Chamber[] {
  const n = 2 + rng.int(0, 1);
  const a0 = rng.range(0, Math.PI * 2);
  const out: Chamber[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * Math.PI * 2) / n + rng.range(-0.3, 0.3);
    const dist = lay.cliff * rng.range(0.35, 0.5);
    out.push({
      x: lay.cx + Math.cos(a) * dist,
      z: lay.cz + Math.sin(a) * dist,
      floor: c.waterLevel + rng.range(1.8, 2.8),
      rx: rng.range(2.6, 3.9),
      rz: rng.range(2.6, 3.9),
      ry: rng.range(3, 4.4),
    });
  }
  return out;
}

/** Carve value (m, positive = void) of one flat-floored dome chamber at a point in metres. */
function chamberCarve(ch: Chamber, x: number, y: number, z: number): number {
  const dy = Math.max(0, y - ch.floor) / ch.ry;
  const n = Math.hypot((x - ch.x) / ch.rx, (z - ch.z) / ch.rz, dy);
  return Math.min((1 - n) * Math.min(ch.rx, ch.rz), y - ch.floor);
}

/** Ground height (m) of the cache at a position in metres, clamped to the grid. */
function groundAt(c: StyleConfig, H: Float32Array, x: number, z: number): number {
  const ix = Math.min(c.nx - 1, Math.max(0, Math.round(x / c.cellSize)));
  const iz = Math.min(c.nz - 1, Math.max(0, Math.round(z / c.cellSize)));
  return H[iz * c.nx + ix] as number;
}

/** Tunnel from a chamber outwards to a mouth on the shoreline shelf, at ground level. */
function entranceTunnel(
  c: StyleConfig,
  H: Float32Array,
  lay: Layout,
  ch: Chamber,
  rng: Rng,
): Tunnel {
  const a = Math.atan2(ch.z - lay.cz, ch.x - lay.cx) + rng.range(-0.3, 0.3);
  const shelf = c.waterLevel + SHELF_RISE;
  let r = Math.hypot(ch.x - lay.cx, ch.z - lay.cz);
  const px = (rr: number): [number, number] => [
    lay.cx + Math.cos(a) * rr,
    lay.cz + Math.sin(a) * rr,
  ];
  while (r < lay.cliff + 12 && groundAt(c, H, ...px(r)) > shelf + 0.8) r += 0.5;
  const [ex, ez] = px(r + 1.8);
  const y = shelf + TUNNEL_RADIUS - 0.1;
  const start: Pt = { x: ch.x, y: ch.floor + TUNNEL_RADIUS - 0.1, z: ch.z };
  return buildTunnel(
    wobblyPath(rng, start, { x: ex, y, z: ez }, { segments: 8, sideways: 1.2, vertical: 0.3 }),
    TUNNEL_RADIUS,
  );
}

/** Tunnels joining the chambers in a chain (a ring when there are three). */
function linkTunnels(chambers: Chamber[], rng: Rng): Tunnel[] {
  const out: Tunnel[] = [];
  const n = chambers.length;
  for (let i = 0; i < (n > 2 ? n : 1); i++) {
    const a = chambers[i] as Chamber;
    const b = chambers[(i + 1) % n] as Chamber;
    const pa: Pt = { x: a.x, y: a.floor + TUNNEL_RADIUS - 0.1, z: a.z };
    const pb: Pt = { x: b.x, y: b.floor + TUNNEL_RADIUS - 0.1, z: b.z };
    out.push(
      buildTunnel(
        wobblyPath(rng, pa, pb, { segments: 6, sideways: 1.5, vertical: 0.3 }),
        TUNNEL_RADIUS,
      ),
    );
  }
  return out;
}

/** Vertical skylight shaft centres (m): the first two chambers get one each. */
function makeShafts(chambers: Chamber[], rng: Rng): { x: number; z: number; floor: number }[] {
  return chambers.slice(0, 2).map((ch) => ({
    x: ch.x + rng.range(-0.4, 0.4) * ch.rx,
    z: ch.z + rng.range(-0.4, 0.4) * ch.rz,
    floor: ch.floor + 1,
  }));
}

/**
 * A tall flat-topped mesa (about 15 m) with steep rocky cliffs and a low sandy shelf, hollowed by
 * 2-3 domed chambers (flat floors above the water) joined by tunnels. Tunnel mouths open on the
 * shelf at the cliff foot and two skylight shafts drop from the top into the chambers.
 */
export const cavernsStyle: TerrainStyleImpl = {
  prepare(c, noise, rng): StyleField {
    const cs = c.cellSize;
    const lay: Layout = {
      cx: ((c.nx - 1) / 2) * cs,
      cz: ((c.nz - 1) / 2) * cs,
      cliff: (Math.min(c.nx, c.nz) / 2) * cs * 0.6,
    };
    const H = heightCache(c, noise, lay);
    const chambers = makeChambers(c, lay, rng);
    const tunnels = [
      ...chambers.map((ch) => entranceTunnel(c, H, lay, ch, rng)),
      ...linkTunnels(chambers, rng),
    ];
    const shafts = makeShafts(chambers, rng);
    return {
      surface: (x, z) => H[z * c.nx + x] as number,
      carve: (x, y, z) => {
        const [mx, my, mz] = [x * cs, y * cs, z * cs];
        let v = -Infinity;
        for (const ch of chambers) v = Math.max(v, chamberCarve(ch, mx, my, mz));
        for (const t of tunnels) v = Math.max(v, tunnelCarve(t, mx, my, mz));
        for (const s of shafts) {
          v = Math.max(v, Math.min(SHAFT_RADIUS - Math.hypot(mx - s.x, mz - s.z), my - s.floor));
        }
        return v;
      },
      material: (_x, y, _z, h) =>
        h > c.waterLevel + 2.5 && y * cs < h - TOPSOIL ? MATERIAL_ROCK : undefined,
    };
  },
};
