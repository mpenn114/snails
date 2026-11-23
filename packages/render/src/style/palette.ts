/**
 * Art direction constants (see docs/art-direction.md, the source of truth).
 * Colours are 24-bit `0xRRGGBB` numbers. Keep this file and the doc in sync.
 */

/** Named palette colours grouped by role. */
export const PALETTE = {
  skyTop: 0x7fb4e6,
  skyHorizon: 0xffe2b8,
  haze: 0xf6d9b4,
  sunLight: 0xffd9a0,
  hemiSky: 0xbcd8f0,
  hemiGround: 0x6b5a3c,
  grassTop: 0x86b04a,
  grassEdge: 0x5c8a34,
  soil: 0x946a48,
  deepSoil: 0x5e4230,
  rock: 0x9a968c,
  scorch: 0x2e2622,
  waterShallow: 0x62c7c9,
  waterDeep: 0x2a7f9e,
  waterFoam: 0xf4fbf6,
  snailSkin: 0xf0c9a0,
  uiInk: 0x2b2438,
  uiPaper: 0xfff6e4,
  uiAccent: 0xff8a3d,
} as const;

/** Names of palette entries. */
export type PaletteName = keyof typeof PALETTE;

/** Palette entries that make up terrain (team colours must stay away from these). */
export const TERRAIN_COLOR_NAMES: readonly PaletteName[] = [
  'grassTop',
  'grassEdge',
  'soil',
  'deepSoil',
  'rock',
  'scorch',
];

/** The 8 team shell colours, index = team slot. Saturated, separated for colour-blind play. */
export const TEAM_COLORS: readonly number[] = [
  0xe5283f, // 0 cherry red
  0x1a46c8, // 1 cobalt blue
  0xffd21f, // 2 sunflower yellow
  0xb07cff, // 3 violet
  0xff6fb8, // 4 bubblegum pink
  0x12d0e6, // 5 cyan
  0xff7a14, // 6 tangerine
  0xf6f4fa, // 7 pearl white
];

/** Team colour names, same order as {@link TEAM_COLORS}. */
export const TEAM_COLOR_NAMES: readonly string[] = [
  'cherry',
  'cobalt',
  'sunflower',
  'violet',
  'bubblegum',
  'cyan',
  'tangerine',
  'pearl',
];

/** Sun and sky light parameters. Angles in degrees, intensities in three.js units. */
export const LIGHTING = {
  sunColor: PALETTE.sunLight,
  sunIntensity: 2.4,
  /** Degrees above the horizon. */
  sunElevationDeg: 32,
  /** Degrees clockwise from +Z towards +X. */
  sunAzimuthDeg: 235,
  hemiSkyColor: PALETTE.hemiSky,
  hemiGroundColor: PALETTE.hemiGround,
  hemiIntensity: 1.1,
  exposure: 1.0,
  /** Tone mapper name; maps to THREE.AgXToneMapping. */
  toneMapping: 'agx',
  /** Fog start as a fraction of the camera far plane. */
  fogStartFraction: 0.45,
  /** Fog end as a fraction of the camera far plane. */
  fogEndFraction: 1.0,
  fogColor: PALETTE.haze,
} as const;

/** Shadow softness (PCF radius in shadow-map texels) and map size per quality tier. */
export const SHADOW_SOFTNESS = {
  high: { radius: 3, mapSize: 2048 },
  medium: { radius: 2, mapSize: 1024 },
  low: { radius: 1, mapSize: 512 },
  mobile: { radius: 0, mapSize: 0 },
} as const;

/** Toon shading: 3 light bands, lit-fraction thresholds (high to low) and band brightness. */
export const TOON = {
  bands: 3,
  thresholds: [0.65, 0.3] as readonly number[],
  levels: [1.0, 0.78, 0.58] as readonly number[],
} as const;

/** Triangle budgets per object class (per instance, at LOD0). */
export const TRIANGLE_BUDGETS = {
  snail: 1500,
  shell: 700,
  prop: 200,
  projectile: 120,
  particle: 40,
} as const;

/** Shell height as a fraction of total snail height. */
export const SHELL_HEIGHT_FRACTION = 0.6;

/** HUD style: type scale in CSS px at 1x, corner radius and outline width. */
export const HUD = {
  typeScale: [12, 14, 18, 24, 32, 48] as readonly number[],
  cornerRadius: 12,
  outlineWidth: 2,
} as const;

/** Splits a 24-bit colour into 0..255 channels. */
export function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearRgb(hex: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/** Converts a colour to CIE Lab (D65). */
export function hexToLab(hex: number): [number, number, number] {
  const [r, g, b] = linearRgb(hex);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Perceptual distance (CIE76 delta E) between two colours. */
export function colorDistance(a: number, b: number): number {
  const la = hexToLab(a);
  const lb = hexToLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

/** Colour-vision deficiency kinds simulated by {@link simulateCvd}. */
export type CvdKind = 'protan' | 'deutan';

const CVD_MATRIX: Record<CvdKind, readonly number[]> = {
  protan: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998,
  ],
  deutan: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881,
  ],
};

/** Simulates a colour-vision deficiency (Machado 2009, severity 1.0, linear RGB). */
export function simulateCvd(hex: number, kind: CvdKind): number {
  const m = CVD_MATRIX[kind];
  const [r, g, b] = linearRgb(hex);
  let out = 0;
  for (let row = 0; row < 3; row++) {
    const v = Math.min(
      1,
      Math.max(0, (m[row * 3] ?? 0) * r + (m[row * 3 + 1] ?? 0) * g + (m[row * 3 + 2] ?? 0) * b),
    );
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    out = (out << 8) | Math.round(s * 255);
  }
  return out;
}
