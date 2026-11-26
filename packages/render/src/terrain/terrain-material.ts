import { Color, DataTexture, LinearFilter, RGBAFormat, Vector2, Vector3 } from 'three';
import type { MeshToonMaterial, Texture, WebGLProgramParametersWithUniforms } from 'three';
import { tierProfile, type QualityTier } from '../quality.js';
import {
  bandLevels,
  bandThresholds,
  createToonMaterial,
  toonTierVariant,
} from '../style/materials.js';
import { PALETTE } from '../style/palette.js';
import type { SdfGrid } from '@snails/core';
import {
  NO_SNOW,
  buildOriginalHeightMap,
  createOriginalHeightTexture,
  snowStartFor,
} from './original-height.js';
import { ScorchRing } from './scorch-ring.js';
import {
  TERRAIN_FRAGMENT_COLOR,
  TERRAIN_FRAGMENT_PARS,
  TERRAIN_NORMAL_BLEND,
  TERRAIN_VERTEX_MAIN,
  TERRAIN_VERTEX_PARS,
} from './terrain-shader.js';
import {
  TERRAIN_LAYERS,
  createNeutralTexture,
  loadTerrainTextures,
  pickTextureSet,
  type TerrainTextureSources,
  type TextureFetch,
} from './terrain-textures.js';

/** Colour palette (hex) for terrain layers. */
export interface TerrainPalette {
  grass: number;
  grassEdge: number;
  soil: number;
  rock: number;
  deepSoil: number;
  scorch: number;
  sand: number;
  clay: number;
  snow: number;
}

/** Default earthy palette. */
export const DEFAULT_TERRAIN_PALETTE: TerrainPalette = {
  grass: PALETTE.grassTop,
  grassEdge: PALETTE.grassEdge,
  soil: PALETTE.soil,
  rock: PALETTE.rock,
  deepSoil: PALETTE.deepSoil,
  scorch: PALETTE.scorch,
  sand: PALETTE.sand,
  clay: PALETTE.clay,
  snow: 0xeef3f6,
};

/** Default snow start height: disabled (it is derived from the original terrain when given). */
export const DEFAULT_SNOW_START = NO_SNOW;

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
  /** World height (m) of the waterline: wet band and pale beaches (default 0). */
  waterLevel?: number;
  /** World height (m) where snow caps begin (default: derived from `originalGrid`, else off). */
  snowStart?: number;
  /** Texture URLs; omitted means palette colours only. Loaded async, palette until then. */
  textures?: TerrainTextureSources;
  /** Texture fetcher override (tests); defaults to `THREE.TextureLoader`. */
  fetchTexture?: TextureFetch;
  /** Palette overrides. */
  palette?: Partial<TerrainPalette>;
  /**
   * The terrain as generated (before any carving). When given, a per-column height map is built
   * once and ground more than 0.3 m below it (craters, tunnels) shows dirt and rock, never grass.
   */
  originalGrid?: SdfGrid;
}

/** Toon material with a scorch ring buffer that drives crater darkening. */
export interface TerrainMaterial extends MeshToonMaterial {
  /** Recent explosions; add on explosion events and `advance(dt)` each frame. */
  readonly scorch: ScorchRing;
  /** True once the layer textures replaced the palette fallback. */
  readonly texturesLoaded: boolean;
  /** Resolves true when textures loaded, false if none were requested or loading failed. */
  readonly texturesReady: Promise<boolean>;
}

/** World metres per texture tile for grass, dirt and rock. */
export const TERRAIN_TEXTURE_SCALE = [3.2, 2.6, 4] as const;
/** How strongly each layer's texture detail modulates its palette colour (0 flat, 1 full). */
export const TERRAIN_TEXTURE_CONTRAST = [0.85, 0.8, 0.75] as const;

const SOFT_RAMP_WIDTH = 0.1;
const SOFT_RAMP_SIZE = 64;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Soft-edged toon ramp (light-touch banding) for the terrain: the shared bands, blurred. */
export function createSoftToonRamp(bands: 2 | 3): DataTexture {
  const lv = bandLevels(bands);
  const th = bandThresholds(bands);
  const data = new Uint8Array(SOFT_RAMP_SIZE * 4);
  for (let i = 0; i < SOFT_RAMP_SIZE; i++) {
    const x = (i + 0.5) / SOFT_RAMP_SIZE;
    let v = lv[lv.length - 1] ?? 0.6;
    for (let k = th.length - 1; k >= 0; k--) {
      const t = smoothstep((th[k] ?? 0) - SOFT_RAMP_WIDTH, (th[k] ?? 0) + SOFT_RAMP_WIDTH, x);
      v += ((lv[k] ?? 1) - v) * t;
    }
    data.set([Math.round(v * 255), Math.round(v * 255), Math.round(v * 255), 255], i * 4);
  }
  const tex = new DataTexture(data, SOFT_RAMP_SIZE, 1, RGBAFormat);
  tex.minFilter = tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Returns material options for a quality tier. */
export function terrainMaterialOptionsForTier(tier: QualityTier): TerrainMaterialOptions {
  return { detail: tierProfile(tier).terrainDetail, tier };
}

type Uniforms = ReturnType<typeof buildUniforms>;

function buildUniforms(
  opts: TerrainMaterialOptions,
  scorch: ScorchRing,
  neutral: { color: Texture; normal: Texture },
) {
  const palette = { ...DEFAULT_TERRAIN_PALETTE, ...opts.palette };
  const [sg, sd, sr] = TERRAIN_TEXTURE_SCALE;
  return {
    uTerrainGrass: { value: new Color(palette.grass) },
    uTerrainGrassEdge: { value: new Color(palette.grassEdge) },
    uTerrainSoil: { value: new Color(palette.soil) },
    uTerrainRock: { value: new Color(palette.rock) },
    uTerrainDeep: { value: new Color(palette.deepSoil) },
    uTerrainSand: { value: new Color(palette.sand) },
    uTerrainClay: { value: new Color(palette.clay) },
    uTerrainSnow: { value: new Color(palette.snow) },
    uTerrainWater: { value: opts.waterLevel ?? 0 },
    uTerrainSnowStart: { value: opts.snowStart ?? DEFAULT_SNOW_START },
    uTerrainScorch: { value: new Color(palette.scorch) },
    uTerrainDeepHeight: { value: opts.deepHeight ?? 0 },
    uTerrainDeepBand: { value: opts.deepBand ?? 8 },
    uTerrainTexScale: { value: new Vector3(1 / sg, 1 / sd, 1 / sr) },
    uTerrainTexContrast: { value: new Vector3(...TERRAIN_TEXTURE_CONTRAST) },
    uTerrainNormalStrength: { value: 0.45 },
    uTerrainTexGrass: { value: neutral.color },
    uTerrainTexDirt: { value: neutral.color },
    uTerrainTexRock: { value: neutral.color },
    uTerrainNrmGrass: { value: neutral.normal },
    uTerrainNrmDirt: { value: neutral.normal },
    uTerrainNrmRock: { value: neutral.normal },
    uTerrainBlast: { value: scorch.centres },
    uTerrainBlastK: { value: scorch.strength },
    uTerrainOrigH: { value: neutral.color },
    uTerrainOrigScale: { value: new Vector2(0, 0) },
  };
}

const UNIFORM_KEYS = {
  grass: ['uTerrainTexGrass', 'uTerrainNrmGrass'],
  dirt: ['uTerrainTexDirt', 'uTerrainNrmDirt'],
  rock: ['uTerrainTexRock', 'uTerrainNrmRock'],
} as const;

/** Starts the async load; swaps the loaded maps into the uniforms and returns all of them. */
function loadInto(
  opts: TerrainMaterialOptions,
  detail: boolean,
  uniforms: Uniforms,
  onLoaded: (textures: Texture[]) => void,
): Promise<boolean> {
  if (!opts.textures) return Promise.resolve(false);
  const set = pickTextureSet(opts.textures, detail);
  return loadTerrainTextures(set, opts.fetchTexture, opts.textures.anisotropy).then(
    (loaded) => {
      const all: Texture[] = [];
      for (const l of TERRAIN_LAYERS) {
        const [ck, nk] = UNIFORM_KEYS[l];
        uniforms[ck].value = loaded[l].color;
        all.push(loaded[l].color);
        const n = loaded[l].normal;
        if (n) {
          uniforms[nk].value = n;
          all.push(n);
        }
      }
      onLoaded(all);
      return true;
    },
    () => false,
  );
}

/** Creates the textured, palette-tinted terrain material (soft toon lighting). */
export function createTerrainMaterial(opts: TerrainMaterialOptions = {}): TerrainMaterial {
  const detail = opts.detail ?? true;
  const tier = opts.tier ?? (detail ? 'high' : 'mobile');
  const slots = detail ? TERRAIN_BLAST_SLOTS.full : TERRAIN_BLAST_SLOTS.cheap;
  const scorch = new ScorchRing(slots);
  const neutral = { color: createNeutralTexture('color'), normal: createNeutralTexture('normal') };
  const uniforms = buildUniforms(opts, scorch, neutral);
  const heightMap = opts.originalGrid ? buildOriginalHeightMap(opts.originalGrid) : null;
  const origTex = heightMap ? createOriginalHeightTexture(heightMap) : null;
  if (heightMap && opts.snowStart === undefined) {
    uniforms.uTerrainSnowStart.value = snowStartFor(heightMap.heights);
  }
  if (origTex && opts.originalGrid) {
    const ws = opts.originalGrid.worldSize();
    uniforms.uTerrainOrigH.value = origTex;
    uniforms.uTerrainOrigScale.value.set(1 / ws.x, 1 / ws.z);
  }
  const material = createToonMaterial({ color: 0xffffff, tier }) as TerrainMaterial;
  const ramp = createSoftToonRamp(toonTierVariant(tier).bands);
  material.gradientMap = ramp;
  const state = { loaded: false, disposed: false, owned: [] as Texture[] };
  const defines: Record<string, string> = { TERRAIN_BLASTS: String(slots) };
  defines[detail ? 'TERRAIN_FULL' : 'TERRAIN_SINGLE_SAMPLE'] = '';
  if (detail) defines.TERRAIN_NORMALS = '';
  if (origTex) defines.TERRAIN_ORIGINAL_HEIGHT = '';
  material.defines = defines;
  const ready = loadInto(opts, detail, uniforms, (all) => {
    state.owned = all;
    state.loaded = true;
    if (state.disposed) for (const t of all) t.dispose();
  });
  Object.defineProperties(material, {
    scorch: { value: scorch, enumerable: true },
    texturesLoaded: { get: () => state.loaded, enumerable: true },
    texturesReady: { value: ready, enumerable: true },
  });
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
  material.customProgramCacheKey = (): string =>
    (detail ? 'terrain-full' : 'terrain-cheap') + (origTex ? '-orig' : '');
  material.addEventListener('dispose', () => {
    state.disposed = true;
    for (const t of [ramp, neutral.color, neutral.normal, ...state.owned]) t.dispose();
    origTex?.dispose();
  });
  return material;
}

/** Creates a terrain material for a quality tier. */
export function createTerrainMaterialForTier(
  tier: QualityTier,
  overrides: TerrainMaterialOptions = {},
): TerrainMaterial {
  return createTerrainMaterial({ ...terrainMaterialOptionsForTier(tier), ...overrides });
}
