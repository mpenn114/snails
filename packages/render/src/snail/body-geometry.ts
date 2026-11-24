import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../style/palette.js';

/** Level of detail of the body parts: 0 = full (display), 1 = cheap (mobile). */
export type BodyLod = 0 | 1;

/** Ring counts of the body sweep and cross-section sides of stalks, per LOD. */
export const BODY_LOD_DETAIL: Readonly<
  Record<
    BodyLod,
    { rings: number; around: number; stalkSides: number; stalkRings: number; eyeSegs: number }
  >
> = {
  0: { rings: 18, around: 12, stalkSides: 6, stalkRings: 5, eyeSegs: 8 },
  1: { rings: 10, around: 8, stalkSides: 4, stalkRings: 3, eyeSegs: 6 },
};

/** Body length (tail tip to nose) in metres; the snail faces +X, the sole rests on y = 0. */
export const BODY_LENGTH = 1.4;
/** X of the tail tip. */
export const BODY_TAIL_X = -0.78;
/** Half width of the fattest cross-section. */
const HALF_WIDTH = 0.31;
/** Half height of the cross-section above the centre line. */
const HALF_HEIGHT = 0.28;
/** Fraction of the half height below the centre line (shallow flat-ish sole). */
const BELLY = 0.5;
/** How far the head is raised off the ground (the sole lifts at the front). */
const HEAD_LIFT = 0.14;

/** Eye centre in stalk-local space (origin at the root), per side sign (+Z, -Z). */
export const EYE_OFFSETS: readonly (readonly [number, number, number])[] = [
  [0.12, 0.27, 0.07],
  [0.12, 0.27, -0.07],
];
/** Eyeball radius in metres. */
export const EYE_RADIUS = 0.115;
/** Pupil radius in metres. */
export const PUPIL_RADIUS = 0.062;
/** Pupil rest position in eye space (on the front of the eyeball). */
export const PUPIL_REST: readonly [number, number, number] = [0.07, 0.01, 0];

type Vec3 = [number, number, number];

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Body cross-section scale (0..1) at `u` (0 = tail tip, 1 = nose): tapered tail, round head. */
export function bodyProfile(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 0;
  const tail = Math.pow(Math.min(1, u / 0.62), 0.5);
  const nose = u > 0.86 ? Math.sqrt(Math.max(0, 1 - ((u - 0.86) / 0.14) ** 2)) : 1;
  // The head swells slightly over the neck.
  const head = 1 + 0.1 * smooth(0.7, 0.88, u);
  return Math.min(tail, 1) * nose * head;
}

/** Height (m) by which the sole is lifted at `u`: the head is raised, the tail tip curls up a bit. */
export function bodyLift(u: number): number {
  return HEAD_LIFT * smooth(0.55, 0.95, u) + 0.05 * (1 - smooth(0, 0.18, u));
}

/** Centre-line height at `u`: the sole sits at `bodyLift`, the centre above it. */
function centreY(u: number): number {
  return bodyLift(u) + HALF_HEIGHT * BELLY * bodyProfile(Math.max(u, 0.12));
}

/** Body surface height (top) at the given x, ignoring the lateral curvature (z = 0). */
export function bodyTopY(x: number): number {
  const u = (x - BODY_TAIL_X) / BODY_LENGTH;
  return centreY(u) + HALF_HEIGHT * bodyProfile(u);
}

/** Stalk root positions on the head (body space); index 0 is +Z, index 1 is -Z. */
export const STALK_ROOTS: readonly (readonly [number, number, number])[] = [
  [0.46, bodyTopY(0.46) - 0.07, 0.12],
  [0.46, bodyTopY(0.46) - 0.07, -0.12],
];
const SKIN = new THREE.Color(PALETTE.snailSkin);
const BELLY_COL = new THREE.Color(PALETTE.snailSkin).lerp(new THREE.Color(PALETTE.uiPaper), 0.55);
const BACK_COL = new THREE.Color(PALETTE.snailSkin).lerp(new THREE.Color(PALETTE.soil), 0.12);
const EYE_COL = new THREE.Color(PALETTE.uiPaper).lerp(new THREE.Color(0xffffff), 0.7);
const INK_COL = new THREE.Color(PALETTE.uiInk);

/** A swept surface: `rings` of `m` points each, optional single-point caps at either end. */
interface Sweep {
  rings: Vec3[][];
  colour: (k: number, j: number) => THREE.Color;
  start?: Vec3;
  end?: Vec3;
  startColour?: THREE.Color;
  endColour?: THREE.Color;
}

/** Converts a sweep into an indexed, outward-wound, vertex-coloured geometry. */
function sweepGeometry(s: Sweep): THREE.BufferGeometry {
  const n = s.rings.length;
  const m = (s.rings[0] as Vec3[]).length;
  const pos: number[] = [];
  const col: number[] = [];
  s.rings.forEach((ring, k) =>
    ring.forEach((p, j) => {
      pos.push(...p);
      col.push(...s.colour(k, j).toArray());
    }),
  );
  const index: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < m; j++) {
      const a = k * m + j;
      const a1 = k * m + ((j + 1) % m);
      const b = a + m;
      const b1 = a1 + m;
      index.push(a, b, a1, a1, b, b1);
    }
  }
  const cap = (p: Vec3, c: THREE.Color, ringIdx: number, flip: boolean): void => {
    const ci = pos.length / 3;
    pos.push(...p);
    col.push(...c.toArray());
    for (let j = 0; j < m; j++) {
      const a = ringIdx * m + j;
      const a1 = ringIdx * m + ((j + 1) % m);
      if (flip) index.push(ci, a1, a);
      else index.push(ci, a, a1);
    }
  };
  if (s.start) cap(s.start, s.startColour ?? s.colour(0, 0), 0, false);
  if (s.end) cap(s.end, s.endColour ?? s.colour(n - 1, 0), n - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Smooth slug body: tapered tail, rounded raised head, flat-ish sole, lighter belly. */
function buildBodySweep(lod: BodyLod): THREE.BufferGeometry {
  const { rings: n, around: m } = BODY_LOD_DETAIL[lod];
  const rings: Vec3[][] = [];
  // Interior rings only (1..n-2): the tip and nose are single cap vertices.
  for (let k = 1; k < n - 1; k++) {
    const u = k / (n - 1);
    const x = BODY_TAIL_X + u * BODY_LENGTH;
    const p = bodyProfile(u);
    const ring: Vec3[] = [];
    for (let j = 0; j < m; j++) {
      const phi = (j / m) * Math.PI * 2;
      const sin = Math.sin(phi);
      const lower = sin < 0 ? BELLY * Math.max(sin, -0.87) : sin;
      ring.push([x, centreY(u) + HALF_HEIGHT * p * lower, HALF_WIDTH * p * Math.cos(phi)]);
    }
    rings.push(ring);
  }
  const bodyCol = (k: number, j: number): THREE.Color => {
    const sin = Math.sin((j / m) * Math.PI * 2);
    const c = BACK_COL.clone().lerp(SKIN, smooth(0.6, 0.1, sin));
    return c.lerp(BELLY_COL, smooth(-0.15, -0.8, sin));
  };
  const tailTip: Vec3 = [BODY_TAIL_X, bodyLift(0) + 0.03, 0];
  const nose: Vec3 = [BODY_TAIL_X + BODY_LENGTH, centreY(1) + 0.01, 0];
  return sweepGeometry({
    rings,
    colour: bodyCol,
    start: tailTip,
    end: nose,
    startColour: SKIN,
    endColour: SKIN,
  });
}

/** Builds a tapered tube along `path` with per-ring radii (tip capped). */
function tube(
  path: Vec3[],
  radii: number[],
  sides: number,
  colour: THREE.Color,
): THREE.BufferGeometry {
  const rings = path.map((pt, k) => {
    const next = path[Math.min(k + 1, path.length - 1)] as Vec3;
    const prev = path[Math.max(k - 1, 0)] as Vec3;
    const t = new THREE.Vector3(
      next[0] - prev[0],
      next[1] - prev[1],
      next[2] - prev[2],
    ).normalize();
    const ref = Math.abs(t.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const nrm = ref.clone().cross(t).normalize();
    const bin = nrm.clone().cross(t);
    const r = radii[k] as number;
    return Array.from({ length: sides }, (_, j): Vec3 => {
      const a = (j / sides) * Math.PI * 2;
      const o = nrm
        .clone()
        .multiplyScalar(Math.cos(a) * r)
        .addScaledVector(bin, Math.sin(a) * r);
      return [pt[0] + o.x, pt[1] + o.y, pt[2] + o.z];
    });
  });
  const last = path[path.length - 1] as Vec3;
  return sweepGeometry({ rings, colour: () => colour, end: last });
}

/** Paints every vertex of `g` with a single colour. */
function paint(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Sphere with constant vertex colour, non-indexed attributes dropped (position/normal/colour). */
function ball(r: number, segs: number, c: THREE.Color, at: Vec3): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, segs, Math.max(3, Math.round(segs * 0.7)));
  g.translate(...at);
  g.deleteAttribute('uv');
  return paint(g, c);
}

/** Eye stalk path in stalk-local space: rises, then curves forward and outward. */
function stalkPath(side: 1 | -1, rings: number): Vec3[] {
  const e = EYE_OFFSETS[side === 1 ? 0 : 1] as readonly number[] as Vec3;
  const pts: Vec3[] = [];
  for (let k = 0; k < rings; k++) {
    const t = k / (rings - 1);
    // Mostly vertical start, bending forward towards the end.
    pts.push([e[0] * t * t, e[1] * (1 - (1 - t) ** 1.6), e[2] * t]);
  }
  return pts;
}

/** One eye stalk with its eyeball (stalk skin plus white eyeball), origin at the stalk root. */
function buildStalk(side: 1 | -1, lod: BodyLod): THREE.BufferGeometry {
  const d = BODY_LOD_DETAIL[lod];
  const path = stalkPath(side, d.stalkRings);
  const radii = path.map((_, k) => 0.062 - 0.024 * (k / (path.length - 1)));
  const eyeAt = EYE_OFFSETS[side === 1 ? 0 : 1] as readonly number[] as Vec3;
  const stalk = tube(path, radii, d.stalkSides, SKIN);
  const eye = ball(EYE_RADIUS, d.eyeSegs, EYE_COL, eyeAt);
  const merged = mergeGeometries([stalk, eye], false);
  stalk.dispose();
  eye.dispose();
  if (!merged) throw new Error('stalk merge failed');
  return merged;
}

/** Pupil: a dark ball with a tiny white glint, origin at the pupil centre. */
function buildPupil(lod: BodyLod): THREE.BufferGeometry {
  const segs = Math.max(5, BODY_LOD_DETAIL[lod].eyeSegs - 2);
  const dark = ball(PUPIL_RADIUS, segs, INK_COL, [0, 0, 0]);
  const glint = ball(PUPIL_RADIUS * 0.3, 4, EYE_COL, [0.03, 0.026, -0.015]);
  const merged = mergeGeometries([dark, glint], false);
  dark.dispose();
  glint.dispose();
  if (!merged) throw new Error('pupil merge failed');
  return merged;
}

/** Eyelid: a skin-coloured cap over the top half of an eyeball (pole +Y), origin at the eye. */
function buildLid(lod: BodyLod): THREE.BufferGeometry {
  const segs = Math.max(6, BODY_LOD_DETAIL[lod].eyeSegs);
  const g = new THREE.SphereGeometry(EYE_RADIUS, segs, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  g.deleteAttribute('uv');
  return paint(g, SKIN);
}

/** The pieces of a snail body, built in body space (facing +X, sole on y = 0). */
export interface SnailBodyParts {
  /** Torso: tail, rounded head and flat sole (no tentacles; the face stays clean). */
  body: THREE.BufferGeometry;
  /** Eye stalk with eyeball for the +Z side and the -Z side, origin at the stalk root. */
  stalks: [THREE.BufferGeometry, THREE.BufferGeometry];
  /** Pupil with glint, origin at the pupil centre. */
  pupil: THREE.BufferGeometry;
  /** Eyelid cap (unit eyeball radius, pole up), origin at the eye centre. */
  lid: THREE.BufferGeometry;
}

/** Builds the body, both eye stalks and the pupil for a level of detail. */
export function buildSnailBody(lod: BodyLod = 0): SnailBodyParts {
  const torso = buildBodySweep(lod);
  return {
    body: torso,
    stalks: [buildStalk(1, lod), buildStalk(-1, lod)],
    pupil: buildPupil(lod),
    lid: buildLid(lod),
  };
}

/** Shell height in metres (normalised shell height is 1): about 60% of the snail's height. */
export const SHELL_SCALE = 1.0;
/** X of the shell bounding-box centre on the back. */
const SHELL_CENTRE_X = -0.13;
/** How deep the shell's lowest point sinks into the back, in metres. */
const SHELL_SINK = 0.15;

/**
 * Where the shell sits on the body: scale and mesh position placing the bounding box `box` of
 * the (aperture-at-origin) shell geometry snugly on the back, tucked a little into the body.
 */
export function shellSeat(box: THREE.Box3): {
  scale: number;
  position: [number, number, number];
} {
  const cx = (box.min.x + box.max.x) / 2;
  const x = SHELL_CENTRE_X;
  return {
    scale: SHELL_SCALE,
    position: [x - cx * SHELL_SCALE, bodyTopY(x) - SHELL_SINK - box.min.y * SHELL_SCALE, 0],
  };
}
