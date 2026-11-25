import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../style/palette.js';
import { SKIN, bodyTopY, buildFace, buildTorso } from './body-torso.js';
import { paint, tube, type Vec3 } from './body-util.js';

export { BODY_LENGTH, BODY_TAIL_X, bodyLift, bodyTopY } from './body-torso.js';

/** Level of detail of the body parts: 0 = full (display), 1 = cheap (mobile). */
export type BodyLod = 0 | 1;

/** Ring counts of the body sweep and cross-section sides of stalks, per LOD. */
export const BODY_LOD_DETAIL: Readonly<
  Record<
    BodyLod,
    { rings: number; around: number; stalkSides: number; stalkRings: number; eyeSegs: number }
  >
> = {
  0: { rings: 21, around: 16, stalkSides: 8, stalkRings: 5, eyeSegs: 10 },
  1: { rings: 10, around: 8, stalkSides: 4, stalkRings: 3, eyeSegs: 6 },
};

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

/** Stalk root positions on the head (body space); index 0 is +Z, index 1 is -Z. */
export const STALK_ROOTS: readonly (readonly [number, number, number])[] = [
  [0.44, bodyTopY(0.44) - 0.08, 0.13],
  [0.44, bodyTopY(0.44) - 0.08, -0.13],
];
const EYE_COL = new THREE.Color(PALETTE.uiPaper).lerp(new THREE.Color(0xffffff), 0.7);
const INK_COL = new THREE.Color(PALETTE.uiInk);

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
  const radii = path.map((_, k) => 0.05 - 0.018 * (k / (path.length - 1)));
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
  const torso = buildTorso(lod, BODY_LOD_DETAIL[lod].rings);
  const parts = [torso, ...buildFace(lod)];
  const body = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!body) throw new Error('body merge failed');
  return {
    body,
    stalks: [buildStalk(1, lod), buildStalk(-1, lod)],
    pupil: buildPupil(lod),
    lid: buildLid(lod),
  };
}

/** Shell height in metres (normalised shell height is 1): about 60% of the snail's height. */
export const SHELL_SCALE = 1.0;
/** X of the shell bounding-box centre on the back. */
const SHELL_CENTRE_X = -0.19;
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
    position: [
      x - cx * SHELL_SCALE,
      bodyTopY(x) - SHELL_SINK - box.min.y * SHELL_SCALE,
      -((box.min.z + box.max.z) / 2) * SHELL_SCALE,
    ],
  };
}
