import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createAimReticle, reticlePoint } from './aim-reticle.js';

describe('reticlePoint', () => {
  it('lies along the facing at zero elevation', () => {
    const p = reticlePoint({ x: 1, y: 2, z: 3 }, 0, 0, 10);
    expect(p.x).toBeCloseTo(11);
    expect(p.y).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(3);
  });

  it('uses the core facing convention (pi/2 is -Z) and rises with elevation', () => {
    const p = reticlePoint({ x: 0, y: 0, z: 0 }, Math.PI / 2, Math.PI / 6, 10);
    expect(p.z).toBeCloseTo(-10 * Math.cos(Math.PI / 6));
    expect(p.y).toBeCloseTo(5);
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(10);
  });
});

describe('createAimReticle', () => {
  it('is hidden until given an aim and disposes cleanly', () => {
    const r = createAimReticle({ getCamera: () => new THREE.PerspectiveCamera() });
    expect(r.layer.group?.visible).toBe(false);
    r.set({ snailId: 'a', angle: 0.2 });
    r.set(null);
    expect(r.layer.group?.visible).toBe(false);
    r.dispose();
  });
});
