import { PALETTE } from '../style/palette.js';
import { TRAIL_COLOUR } from './pebble-geometry.js';

/** A colour with a pick weight. */
export interface WeightedColour {
  colour: number;
  weight: number;
}

/** Trail look of a weapon's projectile. */
export interface TrailVfx {
  /** sRGB hex of the trail puffs. */
  colour: number;
  /** Puff size multiplier. */
  size: number;
  /** Puff spacing multiplier (below 1 = denser). */
  spacing: number;
}

/** Look of one weapon's impact and trail. All multipliers are relative to the MG-09 default. */
export interface WeaponVfx {
  /** Smoke tint (multiplied into the white-to-grey smoke ramp). */
  smokeTint: number;
  /** Smoke ball count multiplier. */
  smoke: number;
  /** How far smoke balls scatter from the centre (1 = default; high = many small blasts). */
  spread: number;
  /** Debris colours; null means the terrain colours. */
  debrisColours: readonly WeightedColour[] | null;
  /** Debris count multiplier. */
  debris: number;
  /** Spark colour. */
  sparkColour: number;
  /** Spark count multiplier. */
  sparks: number;
  /** Colour the flash ball cools towards. */
  flashColour: number;
  /** Dust ring colour. */
  ringColour: number;
  /** Projectile trail. */
  trail: TrailVfx;
}

/** Counts of each effect element for one explosion. */
export interface VfxCounts {
  smoke: number;
  debris: number;
  sparks: number;
}

const WHITE = 0xffffff;
const SLIME = 0x9bdc3c;
const SALT = 0xf4f8ff;
const SPORE = 0xb48ad8;
const WATER = 0x8fd0ee;
const FIRE = 0xff6a2a;

/** Default look: the MG-09 explosion (unknown and mod weapons use this). */
export const DEFAULT_VFX: WeaponVfx = {
  smokeTint: WHITE,
  smoke: 1,
  spread: 1,
  debrisColours: null,
  debris: 1,
  sparkColour: PALETTE.sunLight,
  sparks: 1,
  flashColour: PALETTE.uiAccent,
  ringColour: PALETTE.haze,
  trail: { colour: TRAIL_COLOUR, size: 1, spacing: 1 },
};

/** Builds a profile as the default with `over` applied. */
export function vfx(over: Partial<WeaponVfx>): WeaponVfx {
  return { ...DEFAULT_VFX, ...over };
}

const SALT_CRYSTALS: readonly WeightedColour[] = [
  { colour: SALT, weight: 5 },
  { colour: 0xcfe4ff, weight: 2 },
];
const GOO: readonly WeightedColour[] = [
  { colour: SLIME, weight: 4 },
  { colour: 0x6fb02a, weight: 2 },
];
const SPLASH: readonly WeightedColour[] = [
  { colour: WATER, weight: 4 },
  { colour: 0xd8f2ff, weight: 2 },
];
const SPORES: readonly WeightedColour[] = [
  { colour: SPORE, weight: 3 },
  { colour: 0xe0c8f0, weight: 2 },
];
const BEETLE: readonly WeightedColour[] = [
  { colour: 0x2b3a2a, weight: 3 },
  { colour: 0x4f7a3a, weight: 2 },
];
const PAPER: readonly WeightedColour[] = [
  { colour: PALETTE.uiPaper, weight: 4 },
  { colour: 0xe8d8b8, weight: 2 },
];
const SHELL: readonly WeightedColour[] = [
  { colour: 0xf0e4c8, weight: 3 },
  { colour: 0xc9a77a, weight: 2 },
];

/** Per-weapon profiles keyed by weapon id; mods add entries with {@link registerWeaponVfx}. */
const PROFILES = new Map<string, WeaponVfx>([
  [
    'base:salt-shaker',
    vfx({
      smoke: 0.5,
      debrisColours: SALT_CRYSTALS,
      debris: 1.3,
      sparkColour: SALT,
      sparks: 1.8,
      flashColour: SALT,
      ringColour: SALT,
      trail: { colour: SALT, size: 0.6, spacing: 1.4 },
    }),
  ],
  [
    'base:slime-grenade',
    vfx({
      smokeTint: SLIME,
      smoke: 0.8,
      debrisColours: GOO,
      debris: 1.4,
      sparkColour: SLIME,
      sparks: 0.5,
      flashColour: SLIME,
      ringColour: SLIME,
      trail: { colour: SLIME, size: 0.9, spacing: 0.8 },
    }),
  ],
  [
    'base:slime-rope',
    vfx({
      smoke: 0.3,
      debrisColours: GOO,
      sparks: 0,
      flashColour: SLIME,
      ringColour: SLIME,
      trail: { colour: SLIME, size: 0.8, spacing: 0.7 },
    }),
  ],
  [
    'base:dew-bomb',
    vfx({
      smokeTint: 0xe6f6ff,
      smoke: 1.2,
      debrisColours: SPLASH,
      debris: 1.5,
      sparkColour: WATER,
      sparks: 0.8,
      flashColour: WATER,
      ringColour: WATER,
      trail: { colour: WATER, size: 0.8, spacing: 1 },
    }),
  ],
  [
    'base:spore-cloud',
    vfx({
      smokeTint: SPORE,
      smoke: 1.8,
      spread: 1.4,
      debrisColours: SPORES,
      debris: 0.6,
      sparkColour: 0xe0c8f0,
      sparks: 0.6,
      flashColour: SPORE,
      ringColour: SPORE,
      trail: { colour: SPORE, size: 1.2, spacing: 0.9 },
    }),
  ],
  [
    'base:beetle-barrage',
    vfx({
      smokeTint: 0xcfd8c0,
      smoke: 1.6,
      spread: 2.2,
      debrisColours: BEETLE,
      debris: 0.9,
      sparks: 0.4,
      trail: { colour: 0x6b7a4a, size: 0.7, spacing: 1.2 },
    }),
  ],
  [
    'base:radula-missile',
    vfx({
      smokeTint: 0xe0e0e0,
      smoke: 1.4,
      debris: 1.3,
      sparkColour: FIRE,
      sparks: 1.5,
      flashColour: FIRE,
      trail: { colour: 0xf0f0f0, size: 1.3, spacing: 0.7 },
    }),
  ],
  [
    'base:shell-drill',
    vfx({
      smoke: 0.6,
      debris: 1.6,
      sparkColour: 0xffe08a,
      sparks: 1.2,
      trail: { colour: PALETTE.soil, size: 1, spacing: 0.9 },
    }),
  ],
  [
    'base:pebble-roller',
    vfx({ smoke: 0.8, debris: 1.4, trail: { colour: TRAIL_COLOUR, size: 1.2, spacing: 1 } }),
  ],
  [
    'base:shell-bash',
    vfx({
      smoke: 0.5,
      debrisColours: SHELL,
      debris: 1.2,
      sparkColour: WHITE,
      sparks: 0.8,
      flashColour: WHITE,
    }),
  ],
  [
    'base:snail-mail',
    vfx({
      smokeTint: PALETTE.uiPaper,
      smoke: 0.9,
      debrisColours: PAPER,
      debris: 1.6,
      sparks: 0.5,
      trail: { colour: PALETTE.uiPaper, size: 0.7, spacing: 1.1 },
    }),
  ],
]);

/** The profile for a weapon id; unknown and mod weapons get {@link DEFAULT_VFX}. */
export function vfxFor(weaponId: string): WeaponVfx {
  return PROFILES.get(weaponId) ?? DEFAULT_VFX;
}

/** Adds or replaces the profile of a weapon id (for mods); omitted fields use the default. */
export function registerWeaponVfx(weaponId: string, profile: Partial<WeaponVfx>): void {
  PROFILES.set(weaponId, vfx(profile));
}

/** Ids that have their own profile. */
export function profiledWeapons(): string[] {
  return [...PROFILES.keys()];
}

/** Picks a colour from `u` in [0,1) by weight. */
export function pickWeighted(colours: readonly WeightedColour[], u: number): number {
  let total = 0;
  for (const c of colours) total += c.weight;
  let x = Math.min(Math.max(u, 0), 0.999999) * total;
  for (const c of colours) {
    if (x < c.weight) return c.colour;
    x -= c.weight;
  }
  return colours[0]?.colour ?? WHITE;
}

/** Scales blast counts by a profile (rounded; a zero stays zero, other counts keep at least 1). */
export function scaleCounts(base: VfxCounts, p: WeaponVfx): VfxCounts {
  const f = (n: number, m: number): number =>
    n === 0 || m === 0 ? 0 : Math.max(1, Math.round(n * m));
  return {
    smoke: f(base.smoke, p.smoke),
    debris: f(base.debris, p.debris),
    sparks: f(base.sparks, p.sparks),
  };
}
