import { LIGHTING, SHADOW_SOFTNESS } from '../style/palette.js';
import { defaultSunDirection } from './sky.js';
import * as THREE from 'three';
import { tierProfile, type QualityTier } from '../quality.js';

/** Axis-aligned world bounds (m). */
export interface Bounds3 {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

/** Orthographic shadow frustum in light space, plus the light placement. */
export interface ShadowFrustum {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
  /** World position of the light (target is the bounds centre). */
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/**
 * Fits an orthographic shadow frustum around `bounds` for light travelling
 * from `direction` (vector pointing from the scene towards the sun).
 */
export function fitShadowFrustum(bounds: Bounds3, direction: THREE.Vector3): ShadowFrustum {
  const centre = bounds.min.clone().add(bounds.max).multiplyScalar(0.5);
  const dir = direction.clone().normalize();
  const radius = bounds.max.clone().sub(bounds.min).length() / 2;
  const dist = radius * 2;
  const position = centre.clone().addScaledVector(dir, dist);
  // Bounding sphere gives a rotation-independent, conservative fit.
  return {
    left: -radius,
    right: radius,
    top: radius,
    bottom: -radius,
    near: Math.max(0.1, dist - radius),
    far: dist + radius,
    position,
    target: centre,
  };
}

/** Lighting options. */
export interface LightingOptions {
  tier: QualityTier;
  /** World bounds of the terrain used to fit the shadow camera. */
  bounds: Bounds3;
  /** Distance haze colour (hex); defaults to the palette haze. */
  fogColor?: number;
  /** Direction towards the sun. */
  sunDirection?: THREE.Vector3;
}

/** Created lighting rig. */
export interface Lighting {
  group: THREE.Group;
  hemisphere: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  fogColor: THREE.Color;
  /** Applies distance haze (the sky dome is a separate mesh) to a scene. */
  applyTo(scene: THREE.Scene): void;
  dispose(): void;
}

/** Shadow map edge length by tier (0 = shadows off). */
export function shadowMapSize(tier: QualityTier): number {
  const p = tierProfile(tier);
  return p.shadows ? p.shadowMapSize : 0;
}

/** Creates hemisphere light and a shadow-casting sun fitted to the terrain bounds. */
export function createLighting(opts: LightingOptions): Lighting {
  const fogColor = new THREE.Color(opts.fogColor ?? LIGHTING.fogColor);
  const group = new THREE.Group();
  group.name = 'lighting';
  const hemisphere = new THREE.HemisphereLight(
    LIGHTING.hemiSkyColor,
    LIGHTING.hemiGroundColor,
    LIGHTING.hemiIntensity,
  );
  const sun = new THREE.DirectionalLight(LIGHTING.sunColor, LIGHTING.sunIntensity);
  const frustum = fitShadowFrustum(opts.bounds, opts.sunDirection ?? defaultSunDirection());
  sun.position.copy(frustum.position);
  sun.target.position.copy(frustum.target);
  const size = shadowMapSize(opts.tier);
  sun.castShadow = size > 0;
  if (size > 0) {
    const cam = sun.shadow.camera;
    cam.left = frustum.left;
    cam.right = frustum.right;
    cam.top = frustum.top;
    cam.bottom = frustum.bottom;
    cam.near = frustum.near;
    cam.far = frustum.far;
    cam.updateProjectionMatrix();
    sun.shadow.mapSize.set(size, size);
    sun.shadow.radius = SHADOW_SOFTNESS[opts.tier].radius;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
  }
  group.add(hemisphere, sun, sun.target);
  return {
    group,
    hemisphere,
    sun,
    fogColor,
    applyTo(scene) {
      scene.background = null;
      scene.fog = new THREE.Fog(fogColor, frustum.far * 1.5, frustum.far * 4);
    },
    dispose() {
      sun.shadow.dispose();
      hemisphere.dispose();
    },
  };
}
