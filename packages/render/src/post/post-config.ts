import type { PostMode, QualityTier } from '../quality.js';
import { tierProfile } from '../quality.js';

/** Tunables of the post chain; values are deliberately mild (see docs/art-direction.md). */
export interface PostConfig {
  mode: Exclude<PostMode, 'none'>;
  /** Screen-space ambient occlusion (N8AO), `full` only. */
  ao: { radius: number; distanceFalloff: number; intensity: number } | null;
  /** Bloom, `full` only. */
  bloom: { intensity: number; threshold: number; smoothing: number } | null;
  /** Warm colour grade: linear RGB multiplier applied before tone mapping, `full` only. */
  warm: readonly [number, number, number] | null;
  /** Vignette, `full` only. */
  vignette: { offset: number; darkness: number } | null;
}

/** Post-processing parameters per mode (single source for the pipeline and its tests). */
export const POST_CONFIGS: Readonly<Record<Exclude<PostMode, 'none'>, PostConfig>> = {
  full: {
    mode: 'full',
    ao: { radius: 1.2, distanceFalloff: 1.0, intensity: 2.2 },
    bloom: { intensity: 0.22, threshold: 0.85, smoothing: 0.4 },
    warm: [1.04, 1.0, 0.93],
    vignette: { offset: 0.35, darkness: 0.4 },
  },
  basic: { mode: 'basic', ao: null, bloom: null, warm: null, vignette: null },
};

/** Returns the post chain for a tier, or null when the tier renders straight to the canvas. */
export function postConfigForTier(tier: QualityTier): PostConfig | null {
  const mode = tierProfile(tier).post;
  return mode === 'none' ? null : POST_CONFIGS[mode];
}
