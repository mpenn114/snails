import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyQuality,
  pickDefaultTier,
  QUALITY_TABLE,
  QUALITY_TIERS,
  qualitySettings,
  type QualityTier,
} from './quality.js';
import { shadowMapSize } from './environment/lighting.js';
import { createWater } from './environment/water.js';
import { terrainMaterialOptionsForTier } from './terrain/terrain-material.js';

describe('quality table', () => {
  it('costs are monotonic from high to mobile', () => {
    const keys = [
      'renderScale',
      'shadowMapSize',
      'particleScale',
      'maxDynamicLights',
      'chunkBudgetMs',
      'drawDistanceScale',
    ] as const;
    for (const k of keys) {
      for (let i = 1; i < QUALITY_TIERS.length; i++) {
        const a = QUALITY_TABLE[QUALITY_TIERS[i - 1] as QualityTier][k];
        const b = QUALITY_TABLE[QUALITY_TIERS[i] as QualityTier][k];
        expect(a, k).toBeGreaterThanOrEqual(b);
      }
    }
    expect(qualitySettings('high', 3).pixelRatio).toBeGreaterThan(
      qualitySettings('low', 3).pixelRatio,
    );
  });
  it('shadowMapSize is 0 exactly when shadows are off', () => {
    for (const t of QUALITY_TIERS) {
      expect(QUALITY_TABLE[t].shadows).toBe(QUALITY_TABLE[t].shadowMapSize > 0);
    }
  });
});

describe('consumers honour tiers', () => {
  it('read from the table', () => {
    for (const t of QUALITY_TIERS) {
      expect(shadowMapSize(t)).toBe(QUALITY_TABLE[t].shadowMapSize);
      expect(terrainMaterialOptionsForTier(t).detail).toBe(QUALITY_TABLE[t].terrainDetail);
    }
    const bounds = { min: new THREE.Vector3(), max: new THREE.Vector3(10, 5, 10) };
    const hi = createWater({ tier: 'high', level: 1, bounds });
    const lo = createWater({ tier: 'low', level: 1, bounds });
    expect(hi.material.defines).toHaveProperty('RIPPLES');
    expect(lo.material.defines).not.toHaveProperty('RIPPLES');
  });
});

describe('applyQuality', () => {
  it('updates a fake renderer', () => {
    const r = {
      ratio: 0,
      shadowMap: { enabled: true },
      setPixelRatio: (x: number) => {
        r.ratio = x;
      },
    };
    const q = applyQuality(r, 'mobile', 3);
    expect(r.ratio).toBe(q.pixelRatio);
    expect(r.shadowMap.enabled).toBe(false);
    applyQuality(r, 'high', 3);
    expect(r.ratio).toBe(2);
    expect(r.shadowMap.enabled).toBe(true);
  });
});

describe('pickDefaultTier', () => {
  const base = { isMobile: false, dpr: 1, hardwareConcurrency: 8 };
  it('picks by hints', () => {
    expect(pickDefaultTier({ ...base, isMobile: true })).toBe('mobile');
    expect(pickDefaultTier(base)).toBe('high');
    expect(pickDefaultTier({ ...base, hardwareConcurrency: 4 })).toBe('medium');
    expect(pickDefaultTier({ ...base, hardwareConcurrency: 2 })).toBe('low');
    expect(pickDefaultTier({ ...base, gpuHint: 'Google SwiftShader' })).toBe('low');
    expect(pickDefaultTier({ ...base, hardwareConcurrency: 6, gpuHint: 'NVIDIA RTX 3060' })).toBe(
      'high',
    );
    expect(pickDefaultTier({ ...base, hardwareConcurrency: 6, dpr: 3 })).toBe('medium');
  });
});
