import { DEFAULT_TERRAIN_CONFIG } from '@snails/core';
import * as THREE from 'three';
import type { QualityTier } from '../quality.js';
import type { FrameUpdater } from '../render-loop.js';
import { createLighting, type Bounds3, type Lighting } from './lighting.js';
import { createSky, type Sky } from './sky.js';
import { createWater, type Water } from './water.js';

/** Environment options; bounds and water level default to the core default arena. */
export interface EnvironmentOptions {
  tier: QualityTier;
  bounds?: Bounds3;
  waterLevel?: number;
  fogColor?: number;
}

/** Owns lighting and water, attached to a root group. */
export interface Environment {
  lighting: Lighting;
  water: Water;
  sky: Sky;
  /** Frame updater advancing animation. */
  update: FrameUpdater;
  /** Applies sky background and fog to the scene. */
  applyTo(scene: THREE.Scene): void;
  dispose(): void;
}

/** Default arena bounds from the core default terrain config. */
export function defaultTerrainBounds(): Bounds3 {
  const c = DEFAULT_TERRAIN_CONFIG;
  return {
    min: new THREE.Vector3(0, 0, 0),
    max: new THREE.Vector3(c.nx * c.cellSize, c.ny * c.cellSize, c.nz * c.cellSize),
  };
}

/** Creates lighting + water and adds them to `root`. */
export function createEnvironment(root: THREE.Group, opts: EnvironmentOptions): Environment {
  const bounds = opts.bounds ?? defaultTerrainBounds();
  const lighting = createLighting({
    tier: opts.tier,
    bounds,
    ...(opts.fogColor !== undefined ? { fogColor: opts.fogColor } : {}),
  });
  const water = createWater({
    tier: opts.tier,
    bounds,
    level: opts.waterLevel ?? DEFAULT_TERRAIN_CONFIG.waterLevel,
  });
  const sky = createSky({ tier: opts.tier });
  root.add(lighting.group, water.mesh, sky.group);
  return {
    lighting,
    water,
    sky,
    update: (dt) => {
      water.update(dt);
      sky.update(dt);
    },
    applyTo: (scene) => lighting.applyTo(scene),
    dispose() {
      root.remove(lighting.group, water.mesh, sky.group);
      sky.dispose();
      lighting.dispose();
      water.dispose();
    },
  };
}
