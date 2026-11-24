import { DEFAULT_TERRAIN_CONFIG } from '@snails/core';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createEnvironment } from './environment.js';
import { createLighting, fitShadowFrustum, shadowMapSize } from './lighting.js';
import { buildWaterGeometry, createWater, waterGridLines } from './water.js';

const bounds = { min: new THREE.Vector3(0, 0, 0), max: new THREE.Vector3(48, 24, 48) };

describe('fitShadowFrustum', () => {
  it('covers all bounds corners in light space', () => {
    const f = fitShadowFrustum(bounds, new THREE.Vector3(5, 10, 5));
    const cam = new THREE.OrthographicCamera(f.left, f.right, f.top, f.bottom, f.near, f.far);
    cam.position.copy(f.position);
    cam.lookAt(f.target);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    for (const x of [0, 48])
      for (const y of [0, 24])
        for (const z of [0, 48]) {
          const p = new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse);
          const n = p.applyMatrix4(cam.projectionMatrix);
          expect(Math.abs(n.x)).toBeLessThanOrEqual(1.0001);
          expect(Math.abs(n.y)).toBeLessThanOrEqual(1.0001);
          expect(Math.abs(n.z)).toBeLessThanOrEqual(1.0001);
        }
  });
});

describe('lighting', () => {
  it('uses tier-dependent shadows', () => {
    expect(shadowMapSize('high')).toBe(2048);
    expect(createLighting({ tier: 'high', bounds }).sun.castShadow).toBe(true);
    expect(createLighting({ tier: 'mobile', bounds }).sun.castShadow).toBe(false);
  });
  it('sets haze fog and leaves the background to the sky dome', () => {
    const scene = new THREE.Scene();
    createLighting({ tier: 'high', bounds, fogColor: 0x112233 }).applyTo(scene);
    expect(scene.background).toBeNull();
    expect(scene.fog?.color.getHex()).toBe(0x112233);
  });
});

describe('water', () => {
  it('sits at level and extends beyond bounds', () => {
    const w = createWater({ tier: 'high', bounds, level: 4 });
    expect(w.mesh.position.y).toBe(4);
    const box = new THREE.Box3().setFromObject(w.mesh);
    expect(box.min.x).toBeLessThan(0);
    expect(box.max.z).toBeGreaterThan(48);
  });
  it('follows a rising level (sudden death) and ignores an unchanged one', () => {
    const w = createWater({ tier: 'high', bounds, level: 4 });
    w.setLevel(5.5);
    expect(w.level).toBe(5.5);
    expect(w.mesh.position.y).toBe(5.5);
    expect(w.material.uniforms['uLevel']?.value).toBe(5.5);
    w.setLevel(5.5);
    expect(w.mesh.position.y).toBe(5.5);
  });
  it('advances time and uses simpler material on mobile', () => {
    const w = createWater({ tier: 'mobile', bounds, level: 4 });
    w.update(0.5);
    w.update(0.25);
    expect(w.time).toBeCloseTo(0.75);
    expect(w.material.uniforms['uTime']?.value).toBeCloseTo(0.75);
    expect(w.material.defines).not.toHaveProperty('RIPPLES');
    const high = createWater({ tier: 'high', bounds, level: 4 });
    expect(high.material.defines).toHaveProperty('RIPPLES');
  });
});

describe('environment', () => {
  it('defaults water level to core and disposes', () => {
    const root = new THREE.Group();
    const env = createEnvironment(root, { tier: 'high' });
    expect(env.water.mesh.position.y).toBe(DEFAULT_TERRAIN_CONFIG.waterLevel);
    expect(root.children).toContain(env.water.mesh);
    const spy = vi.spyOn(env.water.material, 'dispose');
    env.update(1, null);
    expect(env.water.time).toBe(1);
    env.dispose();
    expect(spy).toHaveBeenCalled();
    expect(root.children).toHaveLength(0);
  });
});

describe('water grid', () => {
  it('has dense lines across the pad and one far line per side', () => {
    const lines = waterGridLines(0, 48, 24, 1.5, 2000);
    expect(lines[0]).toBe(-2000);
    expect(lines[lines.length - 1]).toBe(2048);
    expect(lines.length).toBeGreaterThan(40);
    expect(buildWaterGeometry([0, 1, 2], [0, 1]).getIndex()?.count).toBe(12);
  });
});
