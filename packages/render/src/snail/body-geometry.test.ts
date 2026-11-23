import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TRIANGLE_BUDGETS } from '../style/palette.js';
import { buildShellGeometry, shellParamsFromSeed } from './shell-geometry.js';
import {
  BODY_LENGTH,
  BODY_TAIL_X,
  EYE_OFFSETS,
  STALK_ROOTS,
  bodyTopY,
  buildSnailBody,
  shellSeat,
  type BodyLod,
} from './body-geometry.js';

const tris = (g: THREE.BufferGeometry): number => (g.index?.count ?? 0) / 3;
const total = (lod: BodyLod): number => {
  const p = buildSnailBody(lod);
  return tris(p.body) + tris(p.stalks[0]) + tris(p.stalks[1]) + 2 * tris(p.pupil);
};

describe('snail body geometry', () => {
  it('fills the expected bounds with the sole on the ground', () => {
    const { body } = buildSnailBody(0);
    body.computeBoundingBox();
    const b = body.boundingBox as THREE.Box3;
    expect(b.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(b.min.y).toBeLessThan(0.08);
    expect(b.min.x).toBeCloseTo(BODY_TAIL_X, 1);
    expect(b.max.x).toBeLessThan(BODY_TAIL_X + BODY_LENGTH + 0.2);
    expect(b.max.z - b.min.z).toBeGreaterThan(0.45);
  });

  it('winds triangles outward', () => {
    const { body } = buildSnailBody(0);
    const pos = body.getAttribute('position');
    const nrm = body.getAttribute('normal');
    const centre = new THREE.Vector3(0.0, 0.25, 0);
    let outward = 0;
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).sub(centre);
      outward += p.dot(new THREE.Vector3().fromBufferAttribute(nrm, i)) > 0 ? 1 : 0;
    }
    expect(outward / pos.count).toBeGreaterThan(0.85);
  });

  it('has vertex colours and attachment points on the head', () => {
    const p = buildSnailBody(0);
    expect(p.body.getAttribute('color').count).toBe(p.body.getAttribute('position').count);
    for (const root of STALK_ROOTS) {
      expect(root[0]).toBeGreaterThan(0.3);
      expect(root[1]).toBeLessThanOrEqual(bodyTopY(root[0]));
      expect(root[1]).toBeGreaterThan(bodyTopY(root[0]) - 0.15);
    }
    expect(STALK_ROOTS[0]?.[2]).toBeGreaterThan(0);
    expect(STALK_ROOTS[1]?.[2]).toBeLessThan(0);
    for (const [i, g] of p.stalks.entries()) {
      g.computeBoundingBox();
      const eye = EYE_OFFSETS[i] as readonly number[];
      expect((g.boundingBox as THREE.Box3).max.y).toBeGreaterThan(eye[1] as number);
    }
  });

  it('keeps total triangles within budget and LOD1 cheaper', () => {
    const shell0 = tris(buildShellGeometry(shellParamsFromSeed(3), 0));
    expect(total(0) + shell0).toBeLessThanOrEqual(TRIANGLE_BUDGETS.snail);
    expect(total(1)).toBeLessThan(total(0) / 2);
    const shell1 = tris(buildShellGeometry(shellParamsFromSeed(3), 1));
    expect(total(1) + shell1).toBeLessThan(700);
  });

  it('seats the shell on the back', () => {
    const geo = buildShellGeometry(shellParamsFromSeed(5), 0);
    const seat = shellSeat(geo.boundingBox as THREE.Box3);
    const lowest = seat.position[1] + (geo.boundingBox as THREE.Box3).min.y * seat.scale;
    expect(lowest).toBeLessThan(bodyTopY(-0.2));
    expect(lowest).toBeGreaterThan(bodyTopY(-0.2) - 0.3);
  });
});
