import * as THREE from 'three';
import type { SdfGrid } from '@snails/core';
import { PALETTE } from '../style/palette.js';
import { tierProfile, type QualityTier } from '../quality.js';
import { buildOriginalHeightMap, createOriginalHeightTexture } from '../terrain/original-height.js';
import { WATER_FRAG, WATER_VERT } from './water-shader.js';

/** Water options. */
export interface WaterOptions {
  tier: QualityTier;
  /** World Y of the surface. */
  level: number;
  /** Terrain bounds the plane must extend beyond. */
  bounds: { min: THREE.Vector3; max: THREE.Vector3 };
  /** Extra margin (m) beyond bounds on each side. */
  margin?: number;
}

/** Water surface handle. */
export interface Water {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** World Y of the (undisturbed) surface. */
  readonly level: number;
  /** Moves the surface to `level` (sudden death raises it); view-only, a no-op when unchanged. */
  setLevel(level: number): void;
  /** Advances the animation clock by `dt` seconds. */
  update(dt: number): void;
  /** Current animation time (s). */
  readonly time: number;
  /**
   * Gives the shader the terrain's top-surface heights so it can tint by depth and draw the foam
   * line where water meets ground. View-only; replaces any earlier map.
   */
  setTerrain(grid: SdfGrid): void;
  dispose(): void;
}

/** Wave amplitude (m) on tiers that animate vertices. */
const WAVE_AMP = 0.06;
/** Vertex spacing (m) of the wave region. */
const WAVE_STEP = 1.5;
/** Dense wave region extends this far (m) beyond the terrain bounds. */
const WAVE_PAD = 24;

/**
 * Ascending grid lines along one axis: dense (`step`) across [min - pad, max + pad] so waves have
 * vertices to move, then one sparse line out at each end (`margin`) to reach the horizon.
 */
export function waterGridLines(
  min: number,
  max: number,
  pad: number,
  step: number,
  margin: number,
): number[] {
  const lo = min - pad;
  const hi = max + pad;
  const n = Math.max(1, Math.ceil((hi - lo) / step));
  const lines = [min - margin];
  for (let i = 0; i <= n; i++) lines.push(lo + ((hi - lo) * i) / n);
  lines.push(max + margin);
  return lines;
}

/** Flat grid (y = 0) spanning the given line positions, +Y up. */
export function buildWaterGeometry(xs: number[], zs: number[]): THREE.BufferGeometry {
  const pos = new Float32Array(xs.length * zs.length * 3);
  let k = 0;
  for (const z of zs) {
    for (const x of xs) {
      pos[k++] = x;
      pos[k++] = 0;
      pos[k++] = z;
    }
  }
  const idx: number[] = [];
  const w = xs.length;
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const a = j * w + i;
      idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Builds the water shader material; `map` is the placeholder height texture. */
function createWaterMaterial(
  level: number,
  opacity: number,
  waves: boolean,
  map: THREE.Texture,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
    defines: waves ? { RIPPLES: '', WAVES: '' } : {},
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib['fog']),
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(PALETTE.waterShallow) },
      uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
      uFoam: { value: new THREE.Color(PALETTE.waterFoam) },
      uOpacity: { value: opacity },
      uLevel: { value: level },
      uWaveAmp: { value: WAVE_AMP },
      uHeights: { value: map },
      uInvSize: { value: new THREE.Vector2(1, 1) },
      uHalf: { value: new THREE.Vector4(0, 0, 1, 1) },
      uHasMap: { value: 0 },
    },
  });
}

/** Creates a large animated water surface at `level` extending beyond the bounds. */
export function createWater(opts: WaterOptions): Water {
  const margin = opts.margin ?? 2000;
  const profile = tierProfile(opts.tier);
  const waves = profile.waterQuality === 'ripples';
  const { min, max } = opts.bounds;
  const step = waves ? WAVE_STEP : 1e6;
  const geometry = buildWaterGeometry(
    waterGridLines(min.x, max.x, WAVE_PAD, step, margin),
    waterGridLines(min.z, max.z, WAVE_PAD, step, margin),
  );
  const emptyMap = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  emptyMap.needsUpdate = true;
  const material = createWaterMaterial(opts.level, profile.waterOpacity, waves, emptyMap);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'water';
  mesh.position.set(0, opts.level, 0);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  let time = 0;
  let heightTex: THREE.DataTexture | null = null;
  const u = material.uniforms as Record<string, THREE.IUniform>;
  let level = opts.level;
  return {
    mesh,
    material,
    get level() {
      return level;
    },
    setLevel(next) {
      if (next === level) return;
      level = next;
      mesh.position.y = next;
      u['uLevel']!.value = next;
    },
    update(dt) {
      time += dt;
      u['uTime']!.value = time;
    },
    get time() {
      return time;
    },
    setTerrain(grid) {
      heightTex?.dispose();
      heightTex = createOriginalHeightTexture(buildOriginalHeightMap(grid));
      const ws = grid.worldSize();
      u['uHeights']!.value = heightTex;
      (u['uInvSize']!.value as THREE.Vector2).set(1 / ws.x, 1 / ws.z);
      (u['uHalf']!.value as THREE.Vector4).set(ws.x / 2, ws.z / 2, ws.x / 2, ws.z / 2);
      u['uHasMap']!.value = 1;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      emptyMap.dispose();
      heightTex?.dispose();
    },
  };
}
