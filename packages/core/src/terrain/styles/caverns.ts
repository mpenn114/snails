import { MATERIAL_ROCK } from '../materials.js';
import type { Rng } from '../../rng.js';
import type { ValueNoise } from '../noise.js';
import { buildTunnel, tunnelCarve, wobblyPath, type Pt, type Tunnel } from './features.js';
import { SEA_DEPTH } from './island.js';
import { smoothstep as smooth } from './shared.js';
import type { StyleConfig, StyleField, TerrainStyleImpl } from './types.js';

/** Height of the mesa top above the water (m). */
const MESA_RISE = 12;
/** Height of the shoreline shelf above the water (m). */
const SHELF_RISE = 1;
/** Radius of the connecting tunnels (m). */
const TUNNEL_RADIUS = 1.6;
/** Radius of the arched entrance tunnels (m). */
const MOUTH_RADIUS = 2.4;
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

interface Bump {
  x: number;
  z: number;
  /** Radius (m) and height (m, negative for a hollow). */
  r: number;
  h: number;
}

/** The mesa's shape caches, per column (row-major z * nx + x). */
interface Mesa {
  /** Horizontal signed distance (m) to the cliff outline; negative inside. */
  D: Float32Array;
  /** Top height (m). */
  T: Float32Array;
  /** 1 where the top is a rocky knoll. */
  rocky: Uint8Array;
  /** Low ground (shelf and sea floor) height (m). */
  low: Float32Array;
}

/** Rocky knolls and shallow hollows on top, kept clear of the chambers' roofs. */
function makeBumps(lay: Layout, chambers: Chamber[], rng: Rng): Bump[] {
  const out: Bump[] = [];
  const place = (n: number, r0: number, r1: number, h0: number, h1: number, far: boolean): void => {
    for (let tries = 0, got = 0; got < n && tries < 40; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = lay.cliff * rng.range(0.3, 0.75);
      const b = { x: lay.cx + Math.cos(a) * d, z: lay.cz + Math.sin(a) * d };
      const r = rng.range(r0, r1);
      const h = rng.range(h0, h1);
      const near = chambers.some((ch) => Math.hypot(ch.x - b.x, ch.z - b.z) < ch.rx + r + 2.5);
      if (far && near) continue;
      out.push({ ...b, r, h });
      got++;
    }
  };
  place(3, 3, 5, 1.6, 2.4, false);
  place(2, 3, 4.5, -1, -0.7, true);
  return out;
}

/** Builds the mesa caches: warped outline distance, rolling top with knolls, hollows, a tier. */
function buildMesa(c: StyleConfig, noise: ValueNoise, lay: Layout, bumps: Bump[], tier: number) {
  const n = c.nx * c.nz;
  const mesa: Mesa = {
    D: new Float32Array(n),
    T: new Float32Array(n),
    rocky: new Uint8Array(n),
    low: new Float32Array(n),
  };
  const cs = c.cellSize;
  const hf = cs * c.hillFrequency;
  const sea = c.waterLevel - SEA_DEPTH;
  for (let z = 0; z < c.nz; z++) {
    for (let x = 0; x < c.nx; x++) {
      const i = z * c.nx + x;
      const [mx, mz] = [x * cs, z * cs];
      const R =
        lay.cliff +
        2 * noise.fbm2(x * hf * 0.9 + 40, z * hf * 0.9 - 7, 2) +
        0.8 * noise.fbm2(x * hf * 2.7 + 3, z * hf * 2.7 + 21, 2);
      const d = Math.hypot(mx - lay.cx, mz - lay.cz) - R;
      mesa.D[i] = d;
      let top = c.waterLevel + MESA_RISE + 2 * noise.fbm2(x * hf * 1.4, z * hf * 1.4 + 9, 2);
      const proj = (mx - lay.cx) * Math.cos(tier) + (mz - lay.cz) * Math.sin(tier);
      top += 1.8 * smooth(lay.cliff * 0.25, lay.cliff * 0.25 + 2.5, proj);
      for (const b of bumps) {
        const g = Math.exp(-(((mx - b.x) / b.r) ** 2 + ((mz - b.z) / b.r) ** 2));
        top += b.h * g;
        if (b.h > 0 && g > 0.45) mesa.rocky[i] = 1;
      }
      mesa.T[i] = top;
      const shelf = smooth(6, 3, d);
      const low = c.waterLevel + SHELF_RISE + 0.35 * noise.fbm2(x * hf * 3 + 5, z * hf * 3 + 9, 2);
      mesa.low[i] = sea + shelf * (low - sea);
    }
  }
  return mesa;
}

/** Signed distance (m) of the mesa solid at a cell: clean cliffs with strata ledges and a lean. */
function mesaSdf(c: StyleConfig, m: Mesa, i: number, y: number): number {
  const my = y * c.cellSize;
  const wall = (m.D[i] as number) + 0.3 * Math.sin(my * 2.3) + 0.05 * (my - c.waterLevel);
  return Math.max(my - (m.T[i] as number), wall);
}

/** 2-3 domed chambers with flat floors on a ring around the mesa centre. */
function makeChambers(c: StyleConfig, lay: Layout, rng: Rng): Chamber[] {
  const n = 2 + rng.int(0, 1);
  // The first chamber faces +z so one mouth shows from the default wide camera.
  const a0 = Math.PI / 2 + rng.range(-0.4, 0.4);
  const out: Chamber[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * Math.PI * 2) / n + rng.range(-0.3, 0.3);
    const dist = lay.cliff * rng.range(0.28, 0.4);
    out.push({
      x: lay.cx + Math.cos(a) * dist,
      z: lay.cz + Math.sin(a) * dist,
      floor: c.waterLevel + rng.range(1.8, 2.8),
      rx: rng.range(2.6, 3.9),
      rz: rng.range(2.6, 3.9),
      ry: rng.range(3, 4.2),
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

/** Outline distance (m) of the mesa at a position in metres, clamped to the grid. */
function outline(c: StyleConfig, M: Mesa, x: number, z: number): number {
  const ix = Math.min(c.nx - 1, Math.max(0, Math.round(x / c.cellSize)));
  const iz = Math.min(c.nz - 1, Math.max(0, Math.round(z / c.cellSize)));
  return M.D[iz * c.nx + ix] as number;
}

/** Tunnel from a chamber outwards to a mouth on the shoreline shelf, at ground level. */
function entranceTunnel(c: StyleConfig, M: Mesa, lay: Layout, ch: Chamber, rng: Rng): Tunnel {
  const a = Math.atan2(ch.z - lay.cz, ch.x - lay.cx) + rng.range(-0.3, 0.3);
  const shelf = c.waterLevel + SHELF_RISE;
  let r = Math.hypot(ch.x - lay.cx, ch.z - lay.cz);
  const px = (rr: number): [number, number] => [
    lay.cx + Math.cos(a) * rr,
    lay.cz + Math.sin(a) * rr,
  ];
  while (r < lay.cliff + 12 && outline(c, M, ...px(r)) < 0.3) r += 0.5;
  const [ex, ez] = px(r + 2.5);
  const y = shelf + MOUTH_RADIUS - 0.1;
  const start: Pt = { x: ch.x, y: ch.floor + MOUTH_RADIUS - 0.1, z: ch.z };
  return buildTunnel(
    wobblyPath(rng, start, { x: ex, y, z: ez }, { segments: 8, sideways: 1.2, vertical: 0.3 }),
    MOUTH_RADIUS,
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
    const chambers = makeChambers(c, lay, rng);
    const bumps = makeBumps(lay, chambers, rng);
    const M = buildMesa(c, noise, lay, bumps, rng.range(0, Math.PI * 2));
    const tunnels = [
      ...chambers.map((ch) => entranceTunnel(c, M, lay, ch, rng)),
      ...linkTunnels(chambers, rng),
    ];
    const shafts = makeShafts(chambers, rng);
    return {
      surface: (x, z) => M.low[z * c.nx + x] as number,
      add: (x, y, z) => mesaSdf(c, M, z * c.nx + x, y),
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
      material: (x, y, z) => {
        const i = z * c.nx + x;
        if ((M.D[i] as number) > 1.2) return undefined;
        return y * cs < (M.T[i] as number) - TOPSOIL || M.rocky[i] ? MATERIAL_ROCK : undefined;
      },
    };
  },
};
