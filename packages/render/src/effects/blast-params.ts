import { PALETTE, hexToRgb } from '../style/palette.js';

/** Counts of each effect element for one explosion. */
export interface BlastCounts {
  /** Puffy smoke balls. */
  smoke: number;
  /** Debris chunks (cubes and wedges together). */
  debris: number;
  /** Bright sparks. */
  sparks: number;
}

/** Clamps `v` into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Cubic ease-out on [0,1]. */
export function easeOutCubic(t: number): number {
  const c = 1 - clamp(t, 0, 1);
  return 1 - c * c * c;
}

/** Cubic ease-in on [0,1]. */
export function easeInCubic(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * c;
}

/**
 * How many smoke balls, debris chunks and sparks one explosion emits. Scales with blast radius
 * (metres) and the tier particle multiplier `quality` (1 = display high, 0.25 = phone). The art
 * direction asks for 5 to 9 smoke balls and 6 to 14 debris chunks at the standard radius.
 */
export function blastCounts(radius: number, quality: number): BlastCounts {
  const r = clamp(radius, 0.1, 12);
  const q = clamp(quality, 0, 2);
  if (q === 0) return { smoke: 0, debris: 0, sparks: 0 };
  return {
    smoke: Math.round(clamp((6 + r * 2) * q, 3, 20)),
    debris: Math.round(clamp((5 + r * 2.2) * q, 3, 24)),
    sparks: Math.round(clamp(r * 5 * q, 2, 28)),
  };
}

/** Smoke puff radius multiplier over normalised age: billows out and keeps swelling as it thins. */
export function smokeScale(t: number): number {
  return 0.45 + 0.75 * easeOutCubic(t);
}

/** Debris scale over normalised age: full size, then shrinks away over the last 25%. */
export function debrisScale(t: number): number {
  return 1 - easeInCubic((clamp(t, 0, 1) - 0.75) / 0.25);
}

/** Trail puff scale over normalised age: quick pop to full size, then shrinks to nothing. */
export function puffScale(t: number): number {
  const c = clamp(t, 0, 1);
  return Math.min(1, c / 0.12 + 0.35) * (1 - easeInCubic(c));
}

/** Dust ring radius fraction (of its final radius) over normalised age. */
export function ringScale(t: number): number {
  return 0.25 + 0.75 * easeOutCubic(t);
}

/** Dust ring opacity over normalised age: quick fade-in then fade-out, peak 0.5. */
export function ringOpacity(t: number): number {
  const c = clamp(t, 0, 1);
  return 0.5 * Math.min(1, c / 0.1) * (1 - easeInCubic(c));
}

/** Seconds the flash light/ball and the dust ring live. */
export const FLASH_LIFE = 0.28;

/** Flash ball opacity over normalised age (peak 0.7, fast fade, kept low so bloom stays tame). */
export function flashOpacity(t: number): number {
  const f = 1 - clamp(t, 0, 1);
  return 0.7 * f * f * f;
}

/** Flash ball radius multiplier (of blast radius) over normalised age. */
export function flashScale(t: number): number {
  return 0.25 + 0.4 * easeOutCubic(t);
}

const [PAPER_R, PAPER_G, PAPER_B] = hexToRgb(PALETTE.uiPaper);
const [GREY_R, GREY_G, GREY_B] = hexToRgb(PALETTE.rock);

/**
 * Smoke ball colour (sRGB 0..1) over normalised age, written into `out[0..2]`: warm white
 * (`uiPaper`) cooling to a light neutral grey (half way to `rock`), never tan or dark.
 */
export function smokeColour(t: number, out: Float32Array | number[]): void {
  const m = 0.55 * easeOutCubic(clamp(t, 0, 1) / 0.8);
  out[0] = (PAPER_R + (GREY_R - PAPER_R) * m) / 255;
  out[1] = (PAPER_G + (GREY_G - PAPER_G) * m) / 255;
  out[2] = (PAPER_B + (GREY_B - PAPER_B) * m) / 255;
}

/** Smoke puff opacity over normalised age: fades in fast, peaks soft (0.6), then dissolves. */
export function smokeAlpha(t: number): number {
  const c = clamp(t, 0, 1);
  const f = 1 - c * c;
  return 0.6 * Math.min(1, c / 0.08) * f * f;
}

/** Trail wisp radius multiplier over normalised age: a small puff that swells as it drifts off. */
export function wispScale(t: number): number {
  return 0.5 + 1.1 * easeOutCubic(t);
}

/** Trail wisp opacity over normalised age: soft peak (0.45) near the start, then a long fade. */
export function wispAlpha(t: number): number {
  const c = clamp(t, 0, 1);
  const f = 1 - c;
  return 0.45 * Math.min(1, c / 0.06 + 0.3) * f * f;
}

/** Weighted terrain colours debris is tinted with (soil heavy, some grass turf, rock). */
export const DEBRIS_COLOURS: readonly { colour: number; weight: number }[] = [
  { colour: PALETTE.soil, weight: 4 },
  { colour: PALETTE.grassTop, weight: 3 },
  { colour: PALETTE.deepSoil, weight: 2 },
  { colour: PALETTE.rock, weight: 1.5 },
];

/** Picks a debris colour from `u` in [0,1) by the weights in {@link DEBRIS_COLOURS}. */
export function pickDebrisColour(u: number): number {
  let total = 0;
  for (const d of DEBRIS_COLOURS) total += d.weight;
  let x = clamp(u, 0, 0.999999) * total;
  for (const d of DEBRIS_COLOURS) {
    if (x < d.weight) return d.colour;
    x -= d.weight;
  }
  return PALETTE.soil;
}

/** Dust ring final radius (metres) for a blast radius. */
export function ringRadius(radius: number): number {
  return radius * 1.35;
}
