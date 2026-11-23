import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHTING, SHADOW_SOFTNESS } from '../style/palette.js';
import { createLighting } from './lighting.js';
import { createSky, defaultSunDirection, skyConfig, sunDirectionFromAngles } from './sky.js';

const bounds = { min: new THREE.Vector3(0, 0, 0), max: new THREE.Vector3(48, 24, 48) };

describe('sun direction', () => {
  it('is a unit vector at the configured elevation', () => {
    const d = defaultSunDirection();
    expect(d.length()).toBeCloseTo(1);
    expect((Math.asin(d.y) * 180) / Math.PI).toBeCloseTo(LIGHTING.sunElevationDeg);
  });
  it('measures azimuth clockwise from +Z towards +X', () => {
    expect(sunDirectionFromAngles(0, 0).z).toBeCloseTo(1);
    expect(sunDirectionFromAngles(0, 90).x).toBeCloseTo(1);
    expect(sunDirectionFromAngles(90, 0).y).toBeCloseTo(1);
  });
});

describe('sky', () => {
  it('has clouds only on the high tier', () => {
    expect(skyConfig('high').clouds).toBeGreaterThan(0);
    for (const t of ['medium', 'low', 'mobile'] as const) {
      expect(skyConfig(t).clouds).toBe(0);
      expect(createSky({ tier: t }).clouds).toHaveLength(0);
    }
    expect(createSky({ tier: 'high' }).clouds).toHaveLength(skyConfig('high').clouds);
  });
  it('is unaffected by fog and drawn first', () => {
    const sky = createSky({ tier: 'mobile' });
    expect((sky.dome.material as THREE.ShaderMaterial).fog).toBe(false);
    expect(sky.dome.renderOrder).toBeLessThan(0);
  });
  it('drifts clouds only when updated', () => {
    const sky = createSky({ tier: 'high' });
    const c = sky.clouds[0]!;
    const before = c.position.clone();
    sky.update(0);
    expect(c.position.distanceTo(before)).toBeCloseTo(0);
    sky.update(10);
    expect(c.position.distanceTo(before)).toBeGreaterThan(0);
  });
});

describe('lighting constants', () => {
  it('applies art-direction sun, fill and shadow softness', () => {
    const l = createLighting({ tier: 'high', bounds });
    expect(l.sun.intensity).toBe(LIGHTING.sunIntensity);
    expect(l.hemisphere.intensity).toBe(LIGHTING.hemiIntensity);
    expect(l.sun.shadow.radius).toBe(SHADOW_SOFTNESS.high.radius);
    expect(l.sun.shadow.mapSize.x).toBe(SHADOW_SOFTNESS.high.mapSize);
    const rel = l.sun.position.clone().sub(l.sun.target.position).normalize();
    expect(rel.distanceTo(defaultSunDirection())).toBeLessThan(1e-6);
  });
  it('fog uses the haze colour', () => {
    const scene = new THREE.Scene();
    createLighting({ tier: 'mobile', bounds }).applyTo(scene);
    expect(scene.fog?.color.getHex()).toBe(LIGHTING.fogColor);
  });
});
