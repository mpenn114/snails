import * as THREE from 'three';
import { PALETTE } from '../style/palette.js';

/** Shell pattern names; the index in this list is the shader's pattern id. */
export const SHELL_PATTERNS = [
  'ribs',
  'lines',
  'spots',
  'bands',
  'zigzag',
  'checker',
  'tip',
  'diagonal',
] as const;

/** Name of a shell pattern. */
export type ShellPatternName = (typeof SHELL_PATTERNS)[number];

/** Spiral position (aSpiral) beyond which the shell shows its pale lip. */
export const LIP_START = 0.98;

const fract = (x: number): number => x - Math.floor(x);

/**
 * Pattern id for a team slot: every slot below {@link SHELL_PATTERNS}.length gets a different
 * pattern, so two teams in one match never share one. Wraps for larger indices.
 */
export function shellPatternForTeam(teamIndex: number): number {
  const n = SHELL_PATTERNS.length;
  return ((Math.trunc(teamIndex) % n) + n) % n;
}

/**
 * Pattern mask (0 = base colour, 1 = pattern tint) at shell coordinates: `s` along the spiral
 * (aSpiral, apex 0 to aperture 1) and `a` around the cross-section (aAround). The fragment shader
 * in shell-material.ts mirrors this function (with antialiased edges).
 */
export function patternMask(pattern: number, s: number, a: number): number {
  switch (SHELL_PATTERNS[shellPatternForTeam(pattern)]) {
    case 'ribs':
      return fract(s * 16) < 0.4 ? 1 : 0;
    case 'lines':
      return fract(a * 3 + 0.12) < 0.34 ? 1 : 0;
    case 'spots': {
      const row = Math.floor(a * 4);
      const cx = fract(s * 12 + (row % 2) * 0.5) - 0.5;
      const cy = fract(a * 4) - 0.5;
      return Math.hypot(cx * 1.4, cy) < 0.3 ? 1 : 0;
    }
    case 'bands':
      return fract(s * 4.5) < 0.5 ? 1 : 0;
    case 'zigzag':
      return fract(s * 12 + Math.abs(fract(a * 3) - 0.5) * 1.6) < 0.45 ? 1 : 0;
    case 'checker':
      return (Math.floor(s * 12) + Math.floor(a * 4)) % 2 === 0 ? 1 : 0;
    case 'tip':
      return s < 0.34 ? 1 : 0;
    default:
      return fract(s * 10 + a * 2) < 0.42 ? 1 : 0;
  }
}

/** Fraction of the shell surface (sampled on a grid) that shows the pattern tint. */
export function patternCoverage(pattern: number, samples = 48): number {
  let on = 0;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      on += patternMask(pattern, (i + 0.5) / samples, (j + 0.5) / samples);
    }
  }
  return on / (samples * samples);
}

/** Relative luminance (sRGB weights on the working-space colour) of a colour. */
function luma(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** Pattern tint for a team colour: lighter for dark colours, darker for light ones. */
export function patternTint(base: THREE.Color): THREE.Color {
  const light = luma(base) > 0.42;
  const target = light ? new THREE.Color(PALETTE.uiInk) : new THREE.Color(0xffffff);
  return base.clone().lerp(target, light ? 0.3 : 0.45);
}

/** Pale lip colour at the aperture: warm paper tinted slightly by the team colour. */
export function lipColour(base: THREE.Color): THREE.Color {
  return new THREE.Color(PALETTE.uiPaper).lerp(base, 0.12);
}
