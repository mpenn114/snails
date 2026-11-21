import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { RenderState } from '../render-loop.js';
import {
  advanceWindParticles,
  createWindParticles,
  easeWindVector,
  scatterWindParticles,
  windOpacity,
  windParticleBox,
  windVector,
} from './wind-particles.js';

const bounds = { min: new THREE.Vector3(0, 0, 0), max: new THREE.Vector3(48, 24, 48) };

/** Deterministic LCG in [0, 1) so tests are repeatable. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function inside(positions: Float32Array, box: { min: THREE.Vector3; max: THREE.Vector3 }): boolean {
  for (let k = 0; k < positions.length; k += 3) {
    for (let a = 0; a < 3; a++) {
      const v = positions[k + a]!;
      if (v < box.min.getComponent(a) - 1e-4 || v > box.max.getComponent(a) + 1e-4) return false;
    }
  }
  return true;
}

describe('windVector', () => {
  it('follows the facing convention (0 = +X, PI/2 = -Z)', () => {
    const east = windVector(0, 2);
    expect(east.x).toBeCloseTo(2);
    expect(east.z).toBeCloseTo(0);
    const south = windVector(Math.PI / 2, 3);
    expect(south.x).toBeCloseTo(0);
    expect(south.z).toBeCloseTo(-3);
    const west = windVector(Math.PI, 1);
    expect(west.x).toBeCloseTo(-1);
    expect(west.y).toBe(0);
  });
  it('writes into a provided vector', () => {
    const out = new THREE.Vector3();
    expect(windVector(0, 4, out)).toBe(out);
    expect(out.x).toBeCloseTo(4);
  });
});

describe('advanceWindParticles', () => {
  it('moves particles along the wind', () => {
    const positions = new Float32Array([10, 10, 10, 20, 12, 30]);
    const velocities = new Float32Array(6);
    advanceWindParticles(positions, velocities, 0.5, new THREE.Vector3(2, 0, -1), bounds);
    expect(positions[0]).toBeCloseTo(11);
    expect(positions[2]).toBeCloseTo(9.5);
    expect(positions[3]).toBeCloseTo(21);
    expect(positions[5]).toBeCloseTo(29.5);
  });
  it('wraps particles back inside the bounds', () => {
    const box = windParticleBox(bounds);
    const positions = new Float32Array([47.9, box.min.y + 1, 0.1]);
    const velocities = new Float32Array(3);
    advanceWindParticles(positions, velocities, 1, new THREE.Vector3(3, 0, -3), box);
    expect(positions[0]).toBeGreaterThanOrEqual(0);
    expect(positions[0]).toBeLessThan(48);
    expect(positions[2]).toBeGreaterThanOrEqual(0);
    expect(positions[2]).toBeLessThan(48);
  });
  it('keeps a long run inside the box', () => {
    const box = windParticleBox(bounds);
    const positions = new Float32Array(300);
    const velocities = new Float32Array(300);
    scatterWindParticles(positions, velocities, box, seeded(7));
    const wind = new THREE.Vector3(4, 0, -3);
    for (let step = 0; step < 500; step++) {
      advanceWindParticles(positions, velocities, 0.1, wind, box);
    }
    expect(inside(positions, box)).toBe(true);
  });
});

describe('scatterWindParticles', () => {
  it('places particles inside the box', () => {
    const box = windParticleBox(bounds);
    const positions = new Float32Array(90);
    scatterWindParticles(positions, new Float32Array(90), box, seeded(3));
    expect(inside(positions, box)).toBe(true);
  });
});

describe('easeWindVector', () => {
  it('moves toward the target and converges', () => {
    const current = new THREE.Vector3();
    const target = new THREE.Vector3(6, 0, 0);
    easeWindVector(current, target, 0.1, 1.2);
    expect(current.x).toBeGreaterThan(0);
    expect(current.x).toBeLessThan(6);
    for (let i = 0; i < 300; i++) easeWindVector(current, target, 0.1, 1.2);
    expect(current.x).toBeCloseTo(6, 3);
  });
  it('snaps when tau is zero', () => {
    const current = new THREE.Vector3();
    easeWindVector(current, new THREE.Vector3(1, 0, 1), 0.01, 0);
    expect(current.x).toBe(1);
  });
});

describe('windOpacity', () => {
  it('is nearly invisible at zero wind and rises with strength', () => {
    expect(windOpacity(0, 10)).toBeLessThan(0.05);
    expect(windOpacity(10, 10)).toBeGreaterThan(windOpacity(5, 10));
  });
});

describe('createWindParticles', () => {
  it('creates the requested count and moves along the wind', () => {
    const wp = createWindParticles({ bounds, count: 50, random: seeded(11) });
    expect(wp.count).toBe(50);
    expect(wp.object).toBe(wp.points);
    const attr = wp.points.geometry.getAttribute('position');
    expect(attr.count).toBe(50);
    wp.setTarget(0, 8);
    const before = Array.from({ length: 50 }, (_, i) => attr.getX(i));
    for (let i = 0; i < 20; i++) wp.update(0.1);
    let moved = 0;
    for (let i = 0; i < 50; i++) if (attr.getX(i) - before[i]! > 0) moved++;
    expect(moved).toBeGreaterThan(40);
    wp.dispose();
  });
  it('eases toward a new wind rather than jumping', () => {
    const wp = createWindParticles({ bounds, count: 5, random: seeded(5) });
    wp.setTarget(Math.PI / 2, 10);
    wp.update(0.1);
    const len = wp.wind.length();
    expect(len).toBeGreaterThan(0);
    expect(len).toBeLessThan(10);
    expect(wp.wind.z).toBeLessThan(0);
    for (let i = 0; i < 200; i++) wp.update(0.1);
    expect(wp.wind.z).toBeCloseTo(-10, 2);
    wp.dispose();
  });
  it('reads the snapshot wind through the updater', () => {
    const wp = createWindParticles({ bounds, count: 5, random: seeded(9) });
    const state = {
      snapshot: { wind: { strength: 6, direction: 0 } },
      alpha: 1,
    } as unknown as RenderState;
    for (let i = 0; i < 300; i++) wp.updater(0.1, state);
    expect(wp.wind.x).toBeCloseTo(6, 2);
    wp.dispose();
  });
  it('is nearly invisible at zero wind', () => {
    const wp = createWindParticles({ bounds, count: 10, random: seeded(2) });
    const material = wp.object.material as THREE.PointsMaterial;
    wp.updater(0.1, null);
    expect(material.opacity).toBeLessThan(0.05);
    wp.dispose();
  });
  it('setCount reseeds to the new count', () => {
    const wp = createWindParticles({ bounds, count: 10, random: seeded(4) });
    wp.setCount(25);
    expect(wp.count).toBe(25);
    expect(wp.points.geometry.getAttribute('position').count).toBe(25);
    wp.dispose();
  });
  it('dispose removes the points and frees GPU resources', () => {
    const root = new THREE.Group();
    const wp = createWindParticles({ bounds, count: 10, random: seeded(1) });
    root.add(wp.object);
    const geoSpy = vi.spyOn(wp.points.geometry, 'dispose');
    const matSpy = vi.spyOn(wp.points.material as THREE.Material, 'dispose');
    wp.dispose();
    expect(root.children).toHaveLength(0);
    expect(geoSpy).toHaveBeenCalled();
    expect(matSpy).toHaveBeenCalled();
  });
});
