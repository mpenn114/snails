/** Identifiers of every synthesised cue. */
export type CueId =
  | 'fire'
  | 'explosion'
  | 'splash'
  | 'hurt'
  | 'crack'
  | 'death'
  | 'shellTap'
  | 'crystalChime'
  | 'heartbeat'
  | 'turnStart'
  | 'timerWarning'
  | 'researchComplete'
  | 'hillScored'
  | 'victory'
  | 'defeat';

/** A request to play a cue; the optional fields parameterise its recipe. */
export interface CueRequest {
  id: CueId;
  /** Weapon id (fire, explosion flavour). */
  weaponId?: string;
  /** Blast radius in metres (explosion size). */
  radius?: number;
  /** Damage amount (hurt loudness). */
  amount?: number;
  /** Shell material id (tap pitch). */
  material?: string;
}

/** One synthesis layer: a swept oscillator or filtered noise burst with an exponential decay. */
export interface Layer {
  wave: OscillatorType | 'noise';
  /** Start frequency in Hz (ignored for noise). */
  from: number;
  /** End frequency in Hz (ignored for noise). */
  to: number;
  /** Duration in seconds. */
  dur: number;
  /** Peak gain, 0..1. */
  gain: number;
  /** Start offset in seconds. */
  delay?: number;
  /** Optional biquad filter. */
  filter?: { type: BiquadFilterType; freq: number; q?: number };
}

/** A cue's synthesis recipe. */
export type Recipe = readonly Layer[];

/** Shell tap base pitch in Hz by material id; unknown materials use `default`. */
export const SHELL_TAP_HZ: Readonly<Record<string, number>> = {
  default: 420,
  chalk: 300,
  stone: 240,
  metal: 640,
  bone: 360,
  crystal: 900,
};

/** Per-weapon fire flavour: pitch multiplier, noise share and length multiplier. */
export interface FireVoice {
  pitch: number;
  noise: number;
  len: number;
  wave: OscillatorType;
}

/** Default fire voice (unknown and mod weapons). */
export const DEFAULT_FIRE: FireVoice = { pitch: 1, noise: 0.3, len: 1, wave: 'sine' };

/** Per-weapon fire voices keyed by weapon id (same keys as the weapon VFX table). */
export const FIRE_VOICES: Readonly<Record<string, FireVoice>> = {
  'base:salt-shaker': { pitch: 1.6, noise: 0.5, len: 0.7, wave: 'triangle' },
  'base:slime-grenade': { pitch: 0.7, noise: 0.2, len: 1.1, wave: 'sine' },
  'base:slime-rope': { pitch: 1.3, noise: 0.1, len: 1.2, wave: 'sine' },
  'base:dew-bomb': { pitch: 1.1, noise: 0.15, len: 0.9, wave: 'sine' },
  'base:spore-cloud': { pitch: 0.9, noise: 0.6, len: 1.2, wave: 'triangle' },
  'base:beetle-barrage': { pitch: 0.6, noise: 0.4, len: 1.4, wave: 'sawtooth' },
  'base:radula-missile': { pitch: 1.2, noise: 0.7, len: 1.5, wave: 'sawtooth' },
  'base:shell-drill': { pitch: 0.8, noise: 0.5, len: 1.6, wave: 'square' },
  'base:pebble-roller': { pitch: 0.6, noise: 0.3, len: 1.1, wave: 'sine' },
  'base:shell-bash': { pitch: 0.9, noise: 0.4, len: 0.6, wave: 'square' },
  'base:snail-mail': { pitch: 1.4, noise: 0.2, len: 0.8, wave: 'triangle' },
};

/**
 * Blast loudness and size scaling from a radius in metres.
 * @param radius blast radius; missing, negative or non-finite counts as 2.5
 * @returns `size` 0.4..2 (length and pitch drop) and `gain` 0.3..1
 */
export function blastScale(radius: number | undefined): { size: number; gain: number } {
  const r = radius !== undefined && Number.isFinite(radius) && radius >= 0 ? radius : 2.5;
  return {
    size: Math.min(2, Math.max(0.4, r / 2.5)),
    gain: Math.min(1, Math.max(0.3, 0.3 + r * 0.14)),
  };
}

/**
 * Heartbeat interval for the active snail, or null when health is not low.
 * @param health current hit points
 * @param threshold below this the heartbeat plays
 * @returns milliseconds between beats (faster as health drops)
 */
export function heartbeatIntervalMs(health: number, threshold = 30): number | null {
  if (!(health > 0) || health >= threshold) return null;
  return Math.round(500 + (health / threshold) * 600);
}

/**
 * Pitch of a shell tap for a material.
 * @param material material id or undefined
 */
export function shellTapHz(material: string | undefined): number {
  return (material && SHELL_TAP_HZ[material]) || (SHELL_TAP_HZ.default as number);
}

const note = (
  f: number,
  dur: number,
  gain: number,
  delay = 0,
  wave: OscillatorType = 'sine',
): Layer => ({ wave, from: f, to: f, dur, gain, delay });

const noise = (dur: number, gain: number, filter: Layer['filter']): Layer => ({
  wave: 'noise',
  from: 0,
  to: 0,
  dur,
  gain,
  ...(filter ? { filter } : {}),
});

function fireRecipe(weaponId: string | undefined): Recipe {
  const v = (weaponId && FIRE_VOICES[weaponId]) || DEFAULT_FIRE;
  return [
    { wave: v.wave, from: 220 * v.pitch, to: 60 * v.pitch, dur: 0.2 * v.len, gain: 0.45 },
    noise(0.15 * v.len, 0.3 * v.noise, { type: 'bandpass', freq: 1200 * v.pitch, q: 0.8 }),
  ];
}

function explosionRecipe(weaponId: string | undefined, radius: number | undefined): Recipe {
  const { size, gain } = blastScale(radius);
  const crunch = weaponId === 'base:salt-shaker';
  return [
    { wave: 'sine', from: 110 / size, to: 28, dur: 0.5 * size, gain: 0.6 * gain },
    noise(0.55 * size, 0.5 * gain, { type: 'lowpass', freq: crunch ? 4000 : 1400, q: 0.7 }),
  ];
}

function hurtRecipe(amount: number | undefined): Recipe {
  const g = Math.min(0.5, 0.2 + (amount ?? 20) / 150);
  return [
    noise(0.22, g, { type: 'lowpass', freq: 700, q: 4 }),
    { wave: 'sine', from: 260, to: 90, dur: 0.2, gain: g * 0.8 },
  ];
}

function jingleRecipe(id: CueId): Recipe {
  switch (id) {
    case 'turnStart':
      return [note(660, 0.15, 0.25), note(880, 0.3, 0.25, 0.12)];
    case 'researchComplete':
      return [
        note(523, 0.15, 0.22, 0, 'triangle'),
        note(659, 0.15, 0.22, 0.12, 'triangle'),
        note(784, 0.4, 0.25, 0.24, 'triangle'),
      ];
    case 'hillScored':
      return [note(784, 0.12, 0.2, 0, 'triangle'), note(1047, 0.25, 0.2, 0.1, 'triangle')];
    case 'victory':
      return [523, 659, 784, 1047].map((f, i) => note(f, 0.35, 0.25, i * 0.16, 'triangle'));
    default:
      return [392, 330, 262].map((f, i) => note(f, 0.4, 0.22, i * 0.22, 'sawtooth'));
  }
}

/**
 * Resolves a cue request into its synthesis recipe. Pure; the engine plays the result.
 * @param req what to play
 */
export function recipeFor(req: CueRequest): Recipe {
  switch (req.id) {
    case 'fire':
      return fireRecipe(req.weaponId);
    case 'explosion':
      return explosionRecipe(req.weaponId, req.radius);
    case 'splash':
      return [
        noise(0.4, 0.4, { type: 'bandpass', freq: 2200, q: 0.5 }),
        { wave: 'sine', from: 500, to: 180, dur: 0.18, gain: 0.25 },
      ];
    case 'hurt':
      return hurtRecipe(req.amount);
    case 'crack':
      return [
        noise(0.06, 0.5, { type: 'highpass', freq: 3000 }),
        note(1800, 0.05, 0.2, 0, 'square'),
      ];
    case 'death':
      return [
        {
          wave: 'sawtooth',
          from: 400,
          to: 40,
          dur: 0.7,
          gain: 0.3,
          filter: { type: 'lowpass', freq: 900 },
        },
        noise(0.3, 0.3, { type: 'lowpass', freq: 600 }),
      ];
    case 'shellTap': {
      const f = shellTapHz(req.material);
      return [{ wave: 'triangle', from: f, to: f * 0.8, dur: 0.12, gain: 0.35 }];
    }
    case 'crystalChime':
      return [note(1760, 0.6, 0.18), note(2637, 0.5, 0.12, 0.05), note(3520, 0.4, 0.08, 0.1)];
    case 'heartbeat':
      return [
        { wave: 'sine', from: 70, to: 45, dur: 0.14, gain: 0.5 },
        { wave: 'sine', from: 60, to: 40, dur: 0.16, gain: 0.35, delay: 0.17 },
      ];
    case 'timerWarning':
      return [note(1200, 0.05, 0.12, 0, 'square')];
    default:
      return jingleRecipe(req.id);
  }
}
