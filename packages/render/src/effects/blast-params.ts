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
    smoke: Math.round(clamp((4 + r * 1.2) * q, 2, 12)),
    debris: Math.round(clamp((5 + r * 2.2) * q, 3, 24)),
    sparks: Math.round(clamp(r * 5 * q, 2, 28)),
  };
}

/** Smoke ball radius multiplier over normalised age: eases out to full size, shrinks at the end. */
export function smokeScale(t: number): number {
  const c = clamp(t, 0, 1);
  const grow = 0.3 + 0.7 * easeOutCubic(c / 0.7);
  const shrink = 1 - easeInCubic((c - 0.65) / 0.35);
  return grow * shrink;
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
const [SUN_R, SUN_G, SUN_B] = hexToRgb(PALETTE.sunLight);
const [SCORCH_R, SCORCH_G, SCORCH_B] = hexToRgb(PALETTE.scorch);

/**
 * Smoke ball colour (sRGB 0..1) over normalised age, written into `out[0..2]`: warm white,
 * brightening to `sunLight`, then a grey that darkens towards `scorch` (60% mix at the end).
 */
export function smokeColour(t: number, out: Float32Array | number[]): void {
  const c = clamp(t, 0, 1);
  const warm = easeOutCubic(c / 0.2);
  const grey = easeInCubic(c) * 0.6;
  const r = (PAPER_R + (SUN_R - PAPER_R) * warm) * (1 - grey) + SCORCH_R * grey;
  const g = (PAPER_G + (SUN_G - PAPER_G) * warm) * (1 - grey) + SCORCH_G * grey;
  const b = (PAPER_B + (SUN_B - PAPER_B) * warm) * (1 - grey) + SCORCH_B * grey;
  out[0] = r / 255;
  out[1] = g / 255;
  out[2] = b / 255;
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
