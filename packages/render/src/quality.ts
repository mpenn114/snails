/** Rendering quality tier. */
export type QualityTier = 'high' | 'medium' | 'low' | 'mobile';

/** All tiers, ordered from most to least expensive. */
export const QUALITY_TIERS: readonly QualityTier[] = ['high', 'medium', 'low', 'mobile'];

/** Shadow filtering type (mapped to THREE shadow map constants by the view). */
export type ShadowType = 'pcfsoft' | 'pcf' | 'basic';

/** Water shader quality: animated ripples or a flat tinted plane. */
export type WaterQuality = 'ripples' | 'flat';

/** Static, device-independent settings of one tier (the central quality table row). */
export interface TierProfile {
  /** Upper bound for the device pixel ratio. */
  pixelRatioCap: number;
  /** Multiplier applied to the pixel ratio (internal resolution scale). */
  renderScale: number;
  antialias: boolean;
  shadows: boolean;
  /** Shadow map edge in pixels; 0 when shadows are off. */
  shadowMapSize: number;
  shadowType: ShadowType;
  /** Terrain detail-noise shading in the terrain material. */
  terrainDetail: boolean;
  waterQuality: WaterQuality;
  /** Water surface opacity. */
  waterOpacity: number;
  /** Multiplier for particle counts (consumed by effects). */
  particleScale: number;
  /** Maximum simultaneous dynamic point lights. */
  maxDynamicLights: number;
  /** Main-thread terrain chunk rebuild budget per frame in ms. */
  chunkBudgetMs: number;
  /** Multiplier on camera far plane / draw distance. */
  drawDistanceScale: number;
}

/**
 * Central quality table. Every tier-aware consumer reads from here.
 * Costs decrease from high to mobile.
 */
export const QUALITY_TABLE: Readonly<Record<QualityTier, TierProfile>> = {
  high: {
    pixelRatioCap: 2,
    renderScale: 1,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    shadowType: 'pcfsoft',
    terrainDetail: true,
    waterQuality: 'ripples',
    waterOpacity: 0.7,
    particleScale: 1,
    maxDynamicLights: 8,
    chunkBudgetMs: 8,
    drawDistanceScale: 1,
  },
  medium: {
    pixelRatioCap: 1.5,
    renderScale: 1,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    shadowType: 'pcf',
    terrainDetail: true,
    waterQuality: 'ripples',
    waterOpacity: 0.75,
    particleScale: 0.6,
    maxDynamicLights: 4,
    chunkBudgetMs: 6,
    drawDistanceScale: 0.8,
  },
  low: {
    pixelRatioCap: 1,
    renderScale: 0.85,
    antialias: false,
    shadows: true,
    shadowMapSize: 512,
    shadowType: 'basic',
    terrainDetail: false,
    waterQuality: 'flat',
    waterOpacity: 0.85,
    particleScale: 0.3,
    maxDynamicLights: 2,
    chunkBudgetMs: 4,
    drawDistanceScale: 0.6,
  },
  mobile: {
    pixelRatioCap: 1.5,
    renderScale: 0.75,
    antialias: false,
    shadows: false,
    shadowMapSize: 0,
    shadowType: 'basic',
    terrainDetail: false,
    waterQuality: 'flat',
    waterOpacity: 0.85,
    particleScale: 0.25,
    maxDynamicLights: 0,
    chunkBudgetMs: 3,
    drawDistanceScale: 0.5,
  },
};

/** Returns the static table row for a tier. */
export function tierProfile(tier: QualityTier): TierProfile {
  return QUALITY_TABLE[tier];
}

/** Renderer settings derived from a tier and the device pixel ratio. */
export interface QualitySettings extends TierProfile {
  /** Effective renderer pixel ratio: min(dpr, cap) * renderScale. */
  pixelRatio: number;
}

/** Returns full settings for a tier, given the device pixel ratio. */
export function qualitySettings(tier: QualityTier, devicePixelRatio = 1): QualitySettings {
  const p = QUALITY_TABLE[tier];
  const pixelRatio = Math.min(devicePixelRatio, p.pixelRatioCap) * p.renderScale;
  return { ...p, pixelRatio };
}

/** Minimal renderer surface touched when switching quality at runtime. */
export interface QualityTarget {
  setPixelRatio(ratio: number): void;
  shadowMap?: { enabled: boolean };
}

/**
 * Applies the cheap-to-change settings of a tier to a renderer: pixel ratio and the
 * shadow-map enable flag. Returns the resolved settings.
 *
 * Needs a rebuild (not handled here): antialias (context creation), shadow map size and
 * shadow type (lighting rig), terrain material detail and water variant (recreate the
 * materials via createTerrainMaterialForTier / createWater). The chunk budget lives in
 * `settings.chunkBudgetMs`, read by the terrain scheduler owner; particleScale and
 * maxDynamicLights are read by effects.
 */
export function applyQuality(
  target: QualityTarget,
  tier: QualityTier,
  devicePixelRatio = 1,
): QualitySettings {
  const q = qualitySettings(tier, devicePixelRatio);
  target.setPixelRatio(q.pixelRatio);
  if (target.shadowMap) target.shadowMap.enabled = q.shadows;
  return q;
}

/** Inputs for pickDefaultTier. */
export interface TierHints {
  isMobile: boolean;
  /** Device pixel ratio. */
  dpr: number;
  hardwareConcurrency: number;
  /** Optional GPU renderer string (e.g. from WEBGL_debug_renderer_info). */
  gpuHint?: string;
}

const WEAK_GPU = /swiftshader|llvmpipe|software|mali-4|mali-t|powervr/i;
const STRONG_GPU = /nvidia|geforce|rtx|radeon rx|apple m\d/i;

/** Pure heuristic choosing a default tier from device hints. */
export function pickDefaultTier(h: TierHints): QualityTier {
  if (h.isMobile) return 'mobile';
  if (h.gpuHint && WEAK_GPU.test(h.gpuHint)) return 'low';
  if (h.hardwareConcurrency <= 2) return 'low';
  if (h.hardwareConcurrency <= 4) return 'medium';
  if (h.gpuHint && STRONG_GPU.test(h.gpuHint)) return 'high';
  if (h.dpr > 2 && h.hardwareConcurrency < 8) return 'medium';
  return h.hardwareConcurrency >= 8 ? 'high' : 'medium';
}
