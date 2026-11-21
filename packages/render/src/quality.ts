/** Rendering quality tier. */
export type QualityTier = 'high' | 'mobile';

/** Renderer settings derived from a tier. */
export interface QualitySettings {
  pixelRatio: number;
  shadows: boolean;
  antialias: boolean;
}

/** Returns renderer settings for a tier, given the device pixel ratio. */
export function qualitySettings(tier: QualityTier, devicePixelRatio = 1): QualitySettings {
  if (tier === 'mobile') {
    return { pixelRatio: Math.min(devicePixelRatio, 1.5), shadows: false, antialias: false };
  }
  return { pixelRatio: Math.min(devicePixelRatio, 2), shadows: true, antialias: true };
}
