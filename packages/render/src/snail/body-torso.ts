import * as THREE from 'three';
import { PALETTE } from '../style/palette.js';
import { smooth, sweepGeometry, tube, type Vec3 } from './body-util.js';
import type { BodyLod } from './body-geometry.js';

/** Body length (tail tip to nose) in metres; the snail faces +X, the sole rests on y = 0. */
export const BODY_LENGTH = 1.5;
/** X of the tail tip. */
export const BODY_TAIL_X = -0.8;
/** X of the nose tip. */
export const BODY_NOSE_X = BODY_TAIL_X + BODY_LENGTH;
/** Half width of the foot at its widest (before the head swell). */
const HALF_WIDTH = 0.3;

/** Main skin tone: a warm, slightly desaturated khaki-taupe (never flesh). */
export const SKIN = new THREE.Color(PALETTE.snailSkin);
/** Darker back tone. */
const BACK = new THREE.Color(PALETTE.snailBack);
/** Light foot rim and underside tone. */
const RIM = new THREE.Color(PALETTE.snailRim);
/** Ink used for the smile line. */
const INK = new THREE.Color(PALETTE.uiInk).lerp(BACK, 0.35);

/** A bump that is 1 at `c` and falls smoothly to 0 at distance `w`. */
const bump = (u: number, c: number, w: number): number => 1 - smooth(0, w, Math.abs(u - c));

/** Tail taper (0 at the tip, 1 from about 55% along). */
const tail = (u: number): number => Math.pow(Math.min(1, Math.max(0, u / 0.55)), 0.7);

/** Rounding of the nose: 1 until u = 0.9, then a quarter-ellipse down to 0. */
const noseRound = (u: number): number =>
  u > 0.9 ? Math.sqrt(Math.max(0, 1 - ((u - 0.9) / 0.1) ** 2)) : 1;

/** Half width of the body cross-section at `u` (0 = tail tip, 1 = nose): slim neck, round head. */
export function bodyHalfWidth(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  const swell = 1 - 0.16 * bump(u, 0.66, 0.09) + 0.2 * bump(u, 0.86, 0.12);
  return HALF_WIDTH * tail(u) * swell * noseRound(u);
}

/** Height (m) of the sole at `u`: the tail tip and the head lift off the ground a touch. */
export function bodyLift(u: number): number {
  return 0.035 * (1 - smooth(0, 0.2, u)) + 0.06 * smooth(0.7, 0.95, u);
}

/** Height (m) of the unrounded top of the body at `u`: low foot, raised head on a short neck. */
function topHeight(u: number): number {
  return 0.07 + 0.22 * tail(u) + 0.3 * bump(u, 0.84, 0.15);
}

/** Vertical extent of the body at `u`: `[centre, half height]` (nose rounding applied). */
function extent(u: number): [number, number] {
  const b = bodyLift(u);
  const h = topHeight(u) - b;
  return [b + h / 2, (h / 2) * noseRound(u)];
}

/** Body surface height (top) at the given x, ignoring the lateral curvature (z = 0). */
export function bodyTopY(x: number): number {
  const [c, h] = extent((x - BODY_TAIL_X) / BODY_LENGTH);
  return c + h;
}

/** Half cross-section outline, sole centre to crown: `[z (of half width), y (0 sole .. 1 top)]`. */
const OUTLINE: Record<BodyLod, readonly (readonly [number, number])[]> = {
  0: [
    [0, 0],
    [0.55, 0],
    [0.97, 0.04],
    [1.06, 0.14],
    [0.92, 0.3],
    [0.88, 0.5],
    [0.8, 0.68],
    [0.68, 0.84],
    [0.45, 0.95],
    [0.2, 0.99],
    [0, 1],
  ],
  1: [
    [0, 0],
    [1.0, 0.07],
    [0.9, 0.42],
    [0.5, 0.92],
    [0, 1],
  ],
};

/** Cheap smooth value noise in -1..1 for the soft mottling. */
const mottle = (u: number, y: number, side: number): number =>
  Math.sin(u * 41 + side * 5.1) * Math.sin(y * 9 + u * 17) * 0.6 +
  Math.sin(u * 13 - y * 5 + side * 2.0) * 0.4;

/** Skin colour at body fraction `u`, outline height `y` (0..1) and side sign: back, rim, speckle. */
function skinAt(u: number, y: number, side: number): THREE.Color {
  const c = SKIN.clone().lerp(BACK, smooth(0.5, 1, y) * 0.9);
  c.lerp(RIM, smooth(0.26, 0.04, y));
  const head = smooth(0.78, 0.9, u);
  c.lerp(RIM, 0.12 * head * smooth(0.6, 0.1, y));
  return c.multiplyScalar(1 + 0.06 * mottle(u, y, side));
}

/** Foot, tail and raised head as one smooth sweep with a flared foot rim. */
export function buildTorso(lod: BodyLod, rings: number): THREE.BufferGeometry {
  const half = OUTLINE[lod];
  const n = half.length;
  const m = 2 * (n - 1);
  const pts: { z: number; y: number; side: number }[] = [];
  for (const [z, y] of half) pts.push({ z, y, side: 1 });
  for (const [z, y] of half.slice(1, n - 1).reverse()) pts.push({ z: -z, y, side: -1 });
  const out: Vec3[][] = [];
  for (let k = 1; k < rings - 1; k++) {
    const u = k / (rings - 1);
    const x = BODY_TAIL_X + u * BODY_LENGTH;
    const w = bodyHalfWidth(u);
    const [c, h] = extent(u);
    out.push(pts.map((p): Vec3 => [x, c + (p.y - 0.5) * 2 * h, p.z * w]));
  }
  const tip: Vec3 = [BODY_TAIL_X, extent(0)[0], 0];
  const nose: Vec3 = [BODY_NOSE_X, extent(1)[0], 0];
  return sweepGeometry({
    rings: out,
    colour: (k, j) =>
      skinAt(
        (k + 1) / (rings - 1),
        (pts[j % m] as { y: number }).y,
        (pts[j % m] as { side: number }).side,
      ),
    start: tip,
    end: nose,
    startColour: skinAt(0, 0.5, 1),
    endColour: skinAt(1, 0.4, 1),
  });
}

/** Approximate x of the face surface at height `y` and lateral offset `z` (ellipsoid nose). */
function faceX(y: number, z: number): number {
  const [c, h] = extent(0.9);
  const t = ((y - c) / h) ** 2 + (z / (bodyHalfWidth(0.9) * 0.95)) ** 2;
  return BODY_NOSE_X - 0.15 + 0.15 * Math.sqrt(Math.max(0, 1 - t));
}

/** Centre height of the face (middle of the head). */
const faceY = (): number => extent(0.9)[0];

/** A small smile line and two short lower tentacles, merged into one geometry. */
export function buildFace(lod: BodyLod): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const cy = faceY();
  const segs = lod === 0 ? 7 : 4;
  const mouth: Vec3[] = [];
  for (let i = 0; i < segs; i++) {
    const z = (i / (segs - 1) - 0.5) * 0.26;
    const y = cy - 0.05 + 0.09 * (z / 0.13) ** 2;
    mouth.push([faceX(y, z) + 0.004, y, z]);
  }
  parts.push(
    tube(
      mouth,
      mouth.map(() => 0.013),
      lod === 0 ? 5 : 3,
      INK,
    ),
  );
  const sides = lod === 0 ? 7 : 4;
  for (const s of [1, -1]) {
    const y0 = cy - 0.07;
    const z0 = s * 0.13;
    const x0 = faceX(y0, z0) - 0.03;
    const path: Vec3[] = [
      [x0, y0, z0],
      [x0 + 0.08, y0 + 0.0, z0 * 1.1],
      [x0 + 0.14, y0 + 0.02, z0 * 1.3],
    ];
    parts.push(tube(path, [0.05, 0.045, 0.034], sides, SKIN.clone().lerp(RIM, 0.2)));
  }
  return parts;
}
