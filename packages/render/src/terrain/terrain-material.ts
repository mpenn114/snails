import { Color } from 'three';
import type { MeshToonMaterial, WebGLProgramParametersWithUniforms } from 'three';
import { tierProfile, type QualityTier } from '../quality.js';
import { createToonMaterial } from '../style/materials.js';
import { PALETTE } from '../style/palette.js';
import { ScorchRing } from './scorch-ring.js';
import {
  TERRAIN_FRAGMENT_COLOR,
  TERRAIN_FRAGMENT_PARS,
  TERRAIN_NORMAL_BLEND,
  TERRAIN_VERTEX_MAIN,
  TERRAIN_VERTEX_PARS,
} from './terrain-shader.js';

/** Colour palette (hex) for terrain layers. */
export interface TerrainPalette {
  grass: number;
  grassEdge: number;
  soil: number;
  rock: number;
  deepSoil: number;
  scorch: number;
}

/** Default earthy palette. */
export const DEFAULT_TERRAIN_PALETTE: TerrainPalette = {
  grass: PALETTE.grassTop,
  grassEdge: PALETTE.grassEdge,
  soil: PALETTE.soil,
  rock: PALETTE.rock,
  deepSoil: PALETTE.deepSoil,
  scorch: PALETTE.scorch,
};

/** Recent-explosion slots passed to the shader on full and cheap tiers. */
export const TERRAIN_BLAST_SLOTS = { full: 16, cheap: 8 } as const;

/** Options for {@link createTerrainMaterial}. */
export interface TerrainMaterialOptions {
  /** Full variant: extra noise octave, per-facet jitter, true flat shading (false = cheap). */
  detail?: boolean;
  /** Quality tier used for the toon band count. */
  tier?: QualityTier;
  /** World height (m) at and below which soil is fully dark. */
  deepHeight?: number;
  /** Height (m) of the transition band above deepHeight. */
  deepBand?: number;
  /** Thickness (m) of one soil strata band. */
  strataThickness?: number;
  /** Palette overrides. */
  palette?: Partial<TerrainPalette>;
}

/** Toon material with a scorch ring buffer that drives crater darkening. */
export interface TerrainMaterial extends MeshToonMaterial {
  /** Recent explosions; add on explosion events and `advance(dt)` each frame. */
  readonly scorch: ScorchRing;
}

/** Returns material options for a quality tier. */
export function terrainMaterialOptionsForTier(tier: QualityTier): TerrainMaterialOptions {
  return { detail: tierProfile(tier).terrainDetail, tier };
}

/** Creates the stylised low-poly terrain material (toon bands shared with props and snails). */
export function createTerrainMaterial(opts: TerrainMaterialOptions = {}): TerrainMaterial {
  const palette = { ...DEFAULT_TERRAIN_PALETTE, ...opts.palette };
  const detail = opts.detail ?? true;
  const slots = detail ? TERRAIN_BLAST_SLOTS.full : TERRAIN_BLAST_SLOTS.cheap;
  const scorch = new ScorchRing(slots);
  const uniforms = {
    uTerrainGrass: { value: new Color(palette.grass) },
    uTerrainGrassEdge: { value: new Color(palette.grassEdge) },
    uTerrainSoil: { value: new Color(palette.soil) },
    uTerrainRock: { value: new Color(palette.rock) },
    uTerrainDeep: { value: new Color(palette.deepSoil) },
    uTerrainScorch: { value: new Color(palette.scorch) },
    uTerrainDeepHeight: { value: opts.deepHeight ?? 0 },
    uTerrainDeepBand: { value: opts.deepBand ?? 8 },
    uTerrainStrata: { value: opts.strataThickness ?? 3 },
    uTerrainBlast: { value: scorch.centres },
    uTerrainBlastK: { value: scorch.strength },
  };
  const material = createToonMaterial({
    color: 0xffffff,
    flat: detail,
    tier: opts.tier ?? (detail ? 'high' : 'mobile'),
  }) as TerrainMaterial;
  Object.defineProperty(material, 'scorch', { value: scorch, enumerable: true });
  const defines: Record<string, string> = { TERRAIN_BLASTS: String(slots) };
  defines[detail ? 'TERRAIN_FULL' : 'TERRAIN_SOFT_FACETS'] = '';
  material.defines = defines;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms): void => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${TERRAIN_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${TERRAIN_VERTEX_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TERRAIN_FRAGMENT_PARS}`)
      .replace('#include <normal_fragment_begin>', TERRAIN_NORMAL_BLEND)
      .replace('#include <color_fragment>', TERRAIN_FRAGMENT_COLOR);
  };
  material.customProgramCacheKey = (): string => (detail ? 'terrain-full' : 'terrain-cheap');
  return material;
}

/** Creates a terrain material for a quality tier. */
export function createTerrainMaterialForTier(
  tier: QualityTier,
  overrides: TerrainMaterialOptions = {},
): TerrainMaterial {
  return createTerrainMaterial({ ...terrainMaterialOptionsForTier(tier), ...overrides });
}
