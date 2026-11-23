import { PALETTE } from '../style/palette.js';
import { Color, MeshStandardMaterial } from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';
import { tierProfile, type QualityTier } from '../quality.js';
import {
  TERRAIN_FRAGMENT_COLOR,
  TERRAIN_FRAGMENT_PARS,
  TERRAIN_VERTEX_MAIN,
  TERRAIN_VERTEX_PARS,
} from './terrain-shader.js';

/** Colour palette (hex) for terrain layers. */
export interface TerrainPalette {
  grass: number;
  soil: number;
  rock: number;
  deepSoil: number;
}

/** Default earthy palette. */
export const DEFAULT_TERRAIN_PALETTE: TerrainPalette = {
  grass: PALETTE.grassTop,
  soil: PALETTE.soil,
  rock: PALETTE.rock,
  deepSoil: PALETTE.deepSoil,
};

/** Options for {@link createTerrainMaterial}. */
export interface TerrainMaterialOptions {
  /** Per-fragment triplanar noise detail (false = cheap slope/height blend). */
  detail?: boolean;
  /** Triplanar blend exponent; higher = sharper transitions. */
  sharpness?: number;
  /** Noise frequency in 1/metres. */
  noiseScale?: number;
  /** World height (m) at and below which soil is fully dark. */
  deepHeight?: number;
  /** Height (m) of the transition band above deepHeight. */
  deepBand?: number;
  /** Palette overrides. */
  palette?: Partial<TerrainPalette>;
}

/** Returns material options for a quality tier. */
export function terrainMaterialOptionsForTier(tier: QualityTier): TerrainMaterialOptions {
  return { detail: tierProfile(tier).terrainDetail };
}

/**
 * Normalised triplanar blend weights (sum to 1) from a world normal.
 * Higher `sharpness` concentrates weight on the dominant axis.
 */
export function triplanarWeights(
  nx: number,
  ny: number,
  nz: number,
  sharpness: number,
): [number, number, number] {
  const x = Math.abs(nx) ** sharpness;
  const y = Math.abs(ny) ** sharpness;
  const z = Math.abs(nz) ** sharpness;
  const sum = x + y + z;
  if (sum < 1e-6) return [0, 1, 0];
  return [x / sum, y / sum, z / sum];
}

/** Creates the world-space triplanar terrain material (PBR + shadows kept). */
export function createTerrainMaterial(opts: TerrainMaterialOptions = {}): MeshStandardMaterial {
  const palette = { ...DEFAULT_TERRAIN_PALETTE, ...opts.palette };
  const detail = opts.detail ?? true;
  const uniforms = {
    uTerrainGrass: { value: new Color(palette.grass) },
    uTerrainSoil: { value: new Color(palette.soil) },
    uTerrainRock: { value: new Color(palette.rock) },
    uTerrainDeep: { value: new Color(palette.deepSoil) },
    uTerrainSharpness: { value: opts.sharpness ?? 4 },
    uTerrainDeepHeight: { value: opts.deepHeight ?? 0 },
    uTerrainDeepBand: { value: opts.deepBand ?? 6 },
    uTerrainScale: { value: opts.noiseScale ?? 0.6 },
  };
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  if (detail) material.defines = { TERRAIN_DETAIL: '' };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms): void => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${TERRAIN_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${TERRAIN_VERTEX_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TERRAIN_FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', TERRAIN_FRAGMENT_COLOR);
  };
  material.customProgramCacheKey = (): string => (detail ? 'terrain-d' : 'terrain-c');
  return material;
}

/** Creates a terrain material for a quality tier. */
export function createTerrainMaterialForTier(
  tier: QualityTier,
  overrides: TerrainMaterialOptions = {},
): MeshStandardMaterial {
  return createTerrainMaterial({ ...terrainMaterialOptionsForTier(tier), ...overrides });
}
