import * as THREE from 'three';
import type { QualityTier } from '../quality.js';
import { TOON } from './palette.js';

/** Options for {@link createToonMaterial}. */
export interface ToonMaterialOptions {
  /** Base colour, 24-bit sRGB hex. */
  color: number;
  /** Light bands (2 or 3); defaults to the tier's band count. */
  bands?: 2 | 3;
  /** Faceted normals (low poly look). */
  flat?: boolean;
  /** Rim light strength 0..1 (ignored on tiers without rim). */
  rim?: number;
  /** Quality tier; defaults to `high`. */
  tier?: QualityTier;
  /** Per-vertex colours multiply the base colour. */
  vertexColors?: boolean;
}

/** Tier-dependent toon features. */
export interface ToonTierVariant {
  bands: 2 | 3;
  rim: boolean;
}

/** Returns the toon feature set for a tier (cheap tiers: 2 bands, no rim patch). */
export function toonTierVariant(tier: QualityTier): ToonTierVariant {
  return tier === 'high' || tier === 'medium' ? { bands: 3, rim: true } : { bands: 2, rim: false };
}

/** Brightness per band, brightest first, for a band count. */
export function bandLevels(bands: 2 | 3): number[] {
  const l = TOON.levels;
  return bands === 3 ? [l[0] ?? 1, l[1] ?? 0.78, l[2] ?? 0.58] : [l[0] ?? 1, l[2] ?? 0.58];
}

/** Lit-fraction thresholds (high to low) for a band count. */
export function bandThresholds(bands: 2 | 3): number[] {
  const t = TOON.thresholds;
  return bands === 3 ? [t[0] ?? 0.65, t[1] ?? 0.3] : [t[1] ?? 0.3];
}

/** Pure band lookup: brightness for a lit fraction (0..1, 0.5 = perpendicular). */
export function bandBrightness(lit: number, bands: 2 | 3): number {
  const th = bandThresholds(bands);
  const lv = bandLevels(bands);
  for (let i = 0; i < th.length; i++) if (lit >= (th[i] as number)) return lv[i] as number;
  return lv[lv.length - 1] as number;
}

const GRADIENT_SIZE = 64;
const gradients = new Map<number, THREE.DataTexture>();

/** Shared nearest-filtered gradient ramp (one per band count) for MeshToonMaterial. */
export function getToonGradient(bands: 2 | 3): THREE.DataTexture {
  const hit = gradients.get(bands);
  if (hit) return hit;
  const data = new Uint8Array(GRADIENT_SIZE * 4);
  for (let i = 0; i < GRADIENT_SIZE; i++) {
    const v = Math.round(bandBrightness((i + 0.5) / GRADIENT_SIZE, bands) * 255);
    data.set([v, v, v, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, GRADIENT_SIZE, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradients.set(bands, tex);
  return tex;
}

const RIM_CHUNK = /* glsl */ `
{
  float rimF = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
  outgoingLight += diffuseColor.rgb * rimF * uRim;
}
#include <opaque_fragment>`;

function patchRim(material: THREE.MeshToonMaterial, rim: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: rim };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;')
      .replace('#include <opaque_fragment>', RIM_CHUNK);
  };
  material.customProgramCacheKey = () => `toon-rim-${rim}`;
}

/** Creates a new (uncached) toon material. Use for materials whose colour you mutate. */
export function createToonMaterial(opts: ToonMaterialOptions): THREE.MeshToonMaterial {
  const variant = toonTierVariant(opts.tier ?? 'high');
  const bands = opts.bands ?? variant.bands;
  const material = new THREE.MeshToonMaterial({
    color: opts.color,
    gradientMap: getToonGradient(bands),
    vertexColors: opts.vertexColors ?? false,
  });
  // MeshToonMaterial's typings omit flatShading, but the renderer honours it (FLAT_SHADED).
  if (opts.flat) Object.assign(material, { flatShading: true });
  const rim = opts.rim ?? 0;
  if (variant.rim && rim > 0) patchRim(material, rim);
  return material;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

function cacheKey(o: ToonMaterialOptions): string {
  const v = toonTierVariant(o.tier ?? 'high');
  const rim = v.rim ? (o.rim ?? 0) : 0;
  return [o.color, o.bands ?? v.bands, o.flat ? 1 : 0, rim, o.vertexColors ? 1 : 0].join('|');
}

/**
 * Returns a shared toon material for identical options. Do not mutate or dispose the result;
 * call {@link disposeMaterialCache} at teardown.
 */
export function getToonMaterial(opts: ToonMaterialOptions): THREE.MeshToonMaterial {
  const key = cacheKey(opts);
  let m = cache.get(key);
  if (!m) {
    m = createToonMaterial(opts);
    cache.set(key, m);
  }
  return m;
}

/** Number of cached materials (for tests and diagnostics). */
export function toonCacheSize(): number {
  return cache.size;
}

/** Disposes every cached material and gradient texture. */
export function disposeMaterialCache(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
  for (const t of gradients.values()) t.dispose();
  gradients.clear();
}
