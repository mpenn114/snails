import { TRIANGLE_BUDGETS } from '../style/palette.js';
import * as THREE from 'three';

/** Parameters of a procedural shell (see docs/snail-visuals.md, "Procedural shell generation"). */
export interface ShellParams {
  /** Starting radius of the spiral (0.05..0.12); also blunts the apex. */
  a: number;
  /** Growth rate per radian (0.15..0.30). */
  b: number;
  /** Whorls (3..5.5). */
  turns: number;
  /** Apex lean in radians (0..25 degrees). */
  tilt: number;
  /** Cross-section aspect (0.8..1.3): width along the coil axis over in-plane height. */
  ellipse: number;
  /** Growth ridges along the spiral (0..12). */
  ridges: number;
  /** Surface noise (0..1). */
  bumpiness: number;
}

/** Level of detail: 0 = full (display), 1 = cheap (mobile). */
export type ShellLod = 0 | 1;

/** Rings along the spiral and vertices around the cross-section, per LOD. */
export const SHELL_LOD_DETAIL: Readonly<Record<ShellLod, { rings: number; around: number }>> = {
  0: { rings: 40, around: 8 },
  1: { rings: 22, around: 6 },
};

/** Triangle ceiling per LOD (LOD0 uses the art-direction shell budget). */
export const SHELL_LOD_BUDGET: Readonly<Record<ShellLod, number>> = {
  0: TRIANGLE_BUDGETS.shell,
  1: 300,
};

/** Normalised shell height (bounding box Y extent). The aperture centre sits at the origin. */
export const SHELL_HEIGHT = 1;

/** Tube radius as a fraction of the spiral radius. */
const TUBE = 0.62;
/** Scales `b` so the visible whorls stay chunky (about 1.7x to 2.8x growth per turn). */
const GROWTH = 0.55;
/** Lip flare factor on the last ring. */
const LIP = 1.06;

/** Small deterministic PRNG (mulberry32). Visual only, independent of the simulation. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of strings/numbers into a 32-bit seed (e.g. team id + snail id). */
export function hashShellSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Derives shell parameters from a seed; the same seed always yields the same parameters. */
export function shellParamsFromSeed(seed: number): ShellParams {
  const rnd = seededRandom(seed);
  const range = (lo: number, hi: number): number => lo + (hi - lo) * rnd();
  return {
    a: range(0.05, 0.12),
    b: range(0.15, 0.3),
    turns: range(3, 5.5),
    tilt: (range(0, 25) * Math.PI) / 180,
    ellipse: range(0.8, 1.3),
    ridges: Math.round(range(0, 12)),
    bumpiness: rnd(),
  };
}

interface Ring {
  /** Centre of the cross-section in the spiral plane. */
  cx: number;
  cy: number;
  /** Unit radial direction (in plane). */
  nx: number;
  ny: number;
  /** Cross-section radius. */
  rho: number;
  /** Normalised position along the spiral, 0..1. */
  t: number;
}

function buildRings(p: ShellParams, count: number, rnd: () => number): Ring[] {
  const total = p.turns * Math.PI * 2;
  const rings: Ring[] = [];
  for (let k = 0; k < count; k++) {
    const t = k / (count - 1);
    // Coarser steps at the tiny apex, finer at the big aperture.
    const theta = total * Math.pow(t, 0.8);
    const r = p.a * Math.exp(p.b * GROWTH * theta);
    const nx = Math.cos(theta);
    const ny = Math.sin(theta);
    const ridge = p.ridges > 0 ? 0.07 * Math.sin(t * p.ridges * Math.PI * 2) : 0;
    const bump = (rnd() - 0.5) * 0.07 * p.bumpiness;
    let rho = (TUBE * r + p.a * 0.5) * (1 + ridge + bump);
    if (k === count - 1) rho *= LIP;
    rings.push({ cx: r * nx, cy: r * ny, nx, ny, rho, t });
  }
  return rings;
}

function ringPoint(p: ShellParams, ring: Ring, phi: number): [number, number, number] {
  const out = Math.cos(phi) * ring.rho;
  const z = Math.sin(phi) * ring.rho * p.ellipse;
  return [ring.cx + ring.nx * out, ring.cy + ring.ny * out, z];
}

/** Moves the aperture to the origin facing +X, applies tilt, scales to height 1. */
function normalise(pos: Float32Array, p: ShellParams, last: Ring): void {
  // Tangent of a counter-clockwise spiral at the aperture, rotated onto +X.
  const tx = -last.ny + p.b * GROWTH * last.nx;
  const ty = last.nx + p.b * GROWTH * last.ny;
  const m = new THREE.Matrix4()
    .makeRotationX(p.tilt)
    .multiply(new THREE.Matrix4().makeRotationZ(-Math.atan2(ty, tx)))
    .multiply(new THREE.Matrix4().makeTranslation(-last.cx, -last.cy, 0));
  const v = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    v.fromArray(pos, i).applyMatrix4(m);
    v.toArray(pos, i);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  const s = SHELL_HEIGHT / (maxY - minY);
  for (let i = 0; i < pos.length; i++) pos[i] = (pos[i] as number) * s;
}

function buildIndex(n: number, m: number, apex: number): number[] {
  const cols = m + 1;
  const index: number[] = [];
  for (let j = 0; j < m; j++) index.push(apex, j, j + 1);
  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < m; j++) {
      const a = k * cols + j;
      const b = a + cols;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return index;
}

/**
 * Builds a low-poly spiral shell: closed apex, open aperture with a lip, flat-shading friendly.
 * The aperture centre is at the origin facing +X, the coil axis is Z, and the bounding box
 * height (Y) is {@link SHELL_HEIGHT}. Attributes: `position`, `normal`, `aSpiral` (0 apex to 1
 * aperture), `aAround` (0..1 around the cross-section).
 */
export function buildShellGeometry(params: ShellParams, lod: ShellLod = 0): THREE.BufferGeometry {
  const { rings: n, around: m } = SHELL_LOD_DETAIL[lod];
  const rnd = seededRandom(Math.floor(params.a * 1e6 + params.b * 1e4 + params.turns * 100));
  const rings = buildRings(params, n, rnd);
  const cols = m + 1;
  const vCount = n * cols + 1;
  const pos = new Float32Array(vCount * 3);
  const spiral = new Float32Array(vCount);
  const around = new Float32Array(vCount);
  rings.forEach((ring, k) => {
    for (let j = 0; j < cols; j++) {
      const i = k * cols + j;
      pos.set(ringPoint(params, ring, (j / m) * Math.PI * 2), i * 3);
      spiral[i] = ring.t;
      around[i] = j / m;
    }
  });
  const first = rings[0] as Ring;
  const apex = vCount - 1;
  // Dome the apex backwards along the (negative) spiral tangent.
  const back = first.rho * 0.7;
  pos.set([first.cx + first.ny * back, first.cy - first.nx * back, 0], apex * 3);
  normalise(pos, params, rings[n - 1] as Ring);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSpiral', new THREE.BufferAttribute(spiral, 1));
  geo.setAttribute('aAround', new THREE.BufferAttribute(around, 1));
  geo.setIndex(buildIndex(n, m, apex));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
