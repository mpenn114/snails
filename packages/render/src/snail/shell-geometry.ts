import { TRIANGLE_BUDGETS } from '../style/palette.js';
import * as THREE from 'three';

/** Parameters of a procedural shell (see docs/snail-visuals.md, "Procedural shell generation"). */
export interface ShellParams {
  /** Starting radius of the spiral (0.05..0.10); also blunts the apex. */
  a: number;
  /** Growth rate per radian (0.20..0.27). */
  b: number;
  /** Whorls (2.8..3.5). */
  turns: number;
  /** Extra lean about the aperture axis in radians (-4..4 degrees). */
  tilt: number;
  /** Cross-section aspect (1.0..1.2): extent along the coil axis over the in-plane extent. */
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
  0: { rings: 46, around: 12 },
  1: { rings: 20, around: 6 },
};

/** Triangle ceiling per LOD (LOD0 uses the art-direction shell budget). */
export const SHELL_LOD_BUDGET: Readonly<Record<ShellLod, number>> = {
  0: TRIANGLE_BUDGETS.shell,
  1: 360,
};

/** Normalised shell height (bounding box Y extent). The aperture centre sits at the origin. */
export const SHELL_HEIGHT = 1;

/** Tube radius as a fraction of the spiral radius (whorls overlap, forming the sutures). */
const TUBE = 0.5;
/** Scales `b` so whorls grow about 1.9x to 2.4x per turn. */
const GROWTH = 0.5;
/** Spire height per unit of spiral radius (conical, not a flat disc). */
const SLOPE = 0.22;
/** How far the coil axis leans towards the head (+X), so the spiral face shows from the front. */
export const SHELL_LEAN = (26 * Math.PI) / 180;
/** Lip flare of the last whorl (fraction of the tube radius). */
const FLARE = 0.16;
/** Spiral coordinate of the lip ring; the mouth interior is 1. */
const LIP_S = 0.985;
/** Mouth profile after the last ring: `[offset along the tangent, radius scale, aSpiral]`. */
const MOUTH: readonly (readonly [number, number, number])[] = [
  [0.1, 0.94, 0.994],
  [0.13, 0.8, 1],
  [0.02, 0.66, 1],
  [-0.3, 0.4, 1],
];

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
    a: range(0.05, 0.1),
    b: range(0.2, 0.27),
    turns: range(2.8, 3.5),
    tilt: (range(-4, 4) * Math.PI) / 180,
    ellipse: range(1.0, 1.2),
    ridges: Math.round(range(0, 12)),
    bumpiness: rnd(),
  };
}

type V3 = readonly [number, number, number];

/** A cross-section of the tube: centre, in-plane radial direction and radius. */
interface Ring {
  c: V3;
  nx: number;
  ny: number;
  rho: number;
  /** Spiral coordinate 0 (apex) .. 1 (mouth interior). */
  s: number;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Growth exponent per radian. */
const growth = (p: ShellParams): number => p.b * GROWTH;

/** Unit tangent of the centre line at angle `theta` (derivative of the conical spiral). */
function tangentAt(p: ShellParams, theta: number): THREE.Vector3 {
  const g = growth(p);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return new THREE.Vector3(-s + g * c, c + g * s, -SLOPE * g).normalize();
}

/** Rings along the conical logarithmic spiral, then the rolled mouth rings. */
function buildRings(p: ShellParams, count: number, rnd: () => number): Ring[] {
  const total = p.turns * Math.PI * 2;
  const rings: Ring[] = [];
  for (let k = 0; k < count; k++) {
    const u = k / (count - 1);
    // Coarser steps at the tiny apex, finer at the big aperture.
    const theta = total * Math.pow(u, 0.8);
    const r = p.a * Math.exp(growth(p) * theta);
    const ridge = p.ridges > 0 ? 0.035 * Math.sin(theta * (p.ridges / p.turns / 2)) : 0;
    const bump = (rnd() - 0.5) * 0.03 * p.bumpiness;
    const flare = 1 + FLARE * smoothstep(0.88, 1, u);
    const rho = (TUBE * r + p.a * 0.55) * (1 + ridge + bump) * flare;
    rings.push({
      c: [r * Math.cos(theta), r * Math.sin(theta), -SLOPE * r],
      nx: Math.cos(theta),
      ny: Math.sin(theta),
      rho,
      s: LIP_S * (theta / total),
    });
  }
  const end = rings[count - 1] as Ring;
  const t = tangentAt(p, total);
  for (const [off, scale, s] of MOUTH) {
    const d = off * end.rho;
    rings.push({
      c: [end.c[0] + t.x * d, end.c[1] + t.y * d, end.c[2] + t.z * d],
      nx: end.nx,
      ny: end.ny,
      rho: end.rho * scale,
      s,
    });
  }
  return rings;
}

function ringPoint(p: ShellParams, ring: Ring, phi: number): V3 {
  const out = Math.cos(phi) * ring.rho;
  const z = Math.sin(phi) * ring.rho * p.ellipse;
  return [ring.c[0] + ring.nx * out, ring.c[1] + ring.ny * out, ring.c[2] + z];
}

/** Moves the aperture to the origin facing +X, leans the axis towards +X, scales to height 1. */
function normalise(pos: Float32Array, p: ShellParams, aperture: Ring): number {
  const total = p.turns * Math.PI * 2;
  const t = tangentAt(p, total);
  const m = new THREE.Matrix4()
    .makeRotationX(p.tilt)
    .multiply(new THREE.Matrix4().makeRotationY(-SHELL_LEAN))
    .multiply(new THREE.Matrix4().makeRotationZ(-Math.atan2(t.y, t.x)))
    .multiply(new THREE.Matrix4().makeTranslation(-aperture.c[0], -aperture.c[1], -aperture.c[2]));
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
  return s;
}

function buildIndex(n: number, m: number, apex: number, centre: number): number[] {
  const cols = m + 1;
  const index: number[] = [];
  for (let j = 0; j < m; j++) index.push(apex, j, j + 1);
  const last = (n - 1) * cols;
  for (let j = 0; j < m; j++) index.push(centre, last + j + 1, last + j);
  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < m; j++) {
      const a = k * cols + j;
      const b = a + cols;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return index;
}

/** Averages the normals of the duplicated seam column so the tube has no visible seam. */
function weldSeam(geo: THREE.BufferGeometry, n: number, m: number): void {
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const cols = m + 1;
  const v = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const a = k * cols;
    const b = a + m;
    v.set(nor.getX(a) + nor.getX(b), nor.getY(a) + nor.getY(b), nor.getZ(a) + nor.getZ(b));
    v.normalize();
    nor.setXYZ(a, v.x, v.y, v.z);
    nor.setXYZ(b, v.x, v.y, v.z);
  }
}

/** Flat decal seat on the last whorl: where to put an emblem and which way it faces. */
export interface ShellDecalSpot {
  position: [number, number, number];
  normal: [number, number, number];
}

/** Picks the vertex of the last whorl that faces the (front, slightly raised) viewer best. */
function findDecalSpot(geo: THREE.BufferGeometry, n: number, m: number): ShellDecalSpot {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const view = new THREE.Vector3(0.1, 0.1, -1).normalize();
  const cols = m + 1;
  let best = -Infinity;
  let at = 0;
  for (let k = Math.floor(n * 0.6); k < n - 6; k++) {
    for (let j = 0; j < m; j++) {
      const i = k * cols + j;
      const score = nor.getX(i) * view.x + nor.getY(i) * view.y + nor.getZ(i) * view.z;
      if (score > best) {
        best = score;
        at = i;
      }
    }
  }
  const nv = new THREE.Vector3(nor.getX(at), nor.getY(at), nor.getZ(at));
  const pv = new THREE.Vector3(pos.getX(at), pos.getY(at), pos.getZ(at)).addScaledVector(nv, 0.012);
  return {
    position: pv.toArray() as [number, number, number],
    normal: nv.toArray() as V3 as [number, number, number],
  };
}

/**
 * Builds a conical logarithmic-spiral shell: a smooth tube whose radius grows along the spiral,
 * 2.8 to 3.5 overlapping whorls (the overlap forms the sutures), a raised spire, and a rolled,
 * slightly flared lip around a hollow mouth. The aperture centre is at the origin facing +X,
 * the coil axis (Z, leaning towards +X) points at the viewer's side and the bounding box height
 * (Y) is {@link SHELL_HEIGHT}. Attributes: `position`, `normal`, `aSpiral` (0 apex to 1 mouth
 * interior), `aAround` (0..1 around the cross-section). `userData.decal` holds a
 * {@link ShellDecalSpot}.
 */
export function buildShellGeometry(params: ShellParams, lod: ShellLod = 0): THREE.BufferGeometry {
  const { rings: nSpiral, around: m } = SHELL_LOD_DETAIL[lod];
  const rnd = seededRandom(Math.floor(params.a * 1e6 + params.b * 1e4 + params.turns * 100));
  const rings = buildRings(params, nSpiral, rnd);
  const n = rings.length;
  const cols = m + 1;
  const vCount = n * cols + 2;
  const pos = new Float32Array(vCount * 3);
  const spiral = new Float32Array(vCount);
  const around = new Float32Array(vCount);
  rings.forEach((ring, k) => {
    for (let j = 0; j < cols; j++) {
      const i = k * cols + j;
      pos.set(ringPoint(params, ring, (j / m) * Math.PI * 2), i * 3);
      spiral[i] = ring.s;
      around[i] = j / m;
    }
  });
  const first = rings[0] as Ring;
  const apex = vCount - 2;
  const centre = vCount - 1;
  // Dome the apex backwards along the (negative) spiral tangent.
  const back = tangentAt(params, 0).multiplyScalar(-first.rho * 0.8);
  pos.set([first.c[0] + back.x, first.c[1] + back.y, first.c[2] + back.z], apex * 3);
  // The mouth rings narrow to a point deeper inside the shell.
  const last = rings[n - 1] as Ring;
  const t = tangentAt(params, params.turns * Math.PI * 2);
  const d = -last.rho * 0.5;
  pos.set([last.c[0] + t.x * d, last.c[1] + t.y * d, last.c[2] + t.z * d], centre * 3);
  spiral[centre] = 1;
  around[centre] = 0.5;
  const aperture = rings[nSpiral - 1] as Ring;
  const scale = normalise(pos, params, aperture);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSpiral', new THREE.BufferAttribute(spiral, 1));
  geo.setAttribute('aAround', new THREE.BufferAttribute(around, 1));
  geo.setIndex(buildIndex(n, m, apex, centre));
  geo.computeVertexNormals();
  weldSeam(geo, n, m);
  geo.userData.decal = findDecalSpot(geo, nSpiral, m);
  geo.userData.scale = scale;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
