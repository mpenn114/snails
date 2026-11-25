/**
 * Snail death sequence (M7-07): pure state machine and poses. A snail that dies while watched
 * plays a short sequence (X eyes, body slides out of the shell, puff); one first seen dead shows
 * the final state at once. Drowned shells float and bob at the water surface. Cosmetic only.
 */

/** Length of the death sequence in seconds. */
export const DEATH_DURATION = 0.8;
/** Fraction of the sequence during which the X eyes stay visible. */
export const X_EYES_UNTIL = 0.45;
/** Damage a dead shell shows at minimum (the 'cracked' state). */
export const DEAD_MIN_DAMAGE = 0.5;
/** Peak bob height of a floating shell in metres. */
export const FLOAT_BOB = 0.04;

/** Phase of the death state machine. */
export type DeathPhase = 'alive' | 'dying' | 'dead';

/** Snapshot of the state machine after an update. */
export interface DeathState {
  phase: DeathPhase;
  /** Sequence progress 0..1 (0 while alive, 1 once dead). */
  progress: number;
  /** True only on the update where a watched snail just died (spawn the puff). */
  justDied: boolean;
}

/** Tracks one snail's alive/dead transitions. */
export class DeathTracker {
  private phase: DeathPhase = 'alive';
  private t = 0;
  private seen = false;

  /**
   * Advances by `dt` seconds given the latest alive flag. The first update decides the start
   * state: dead on first sight skips the animation.
   */
  update(alive: boolean, dt: number): DeathState {
    let justDied = false;
    if (!this.seen) {
      this.seen = true;
      if (!alive) {
        this.phase = 'dead';
        this.t = DEATH_DURATION;
      }
    } else if (alive) {
      this.phase = 'alive';
      this.t = 0;
    } else if (this.phase === 'alive') {
      this.phase = 'dying';
      this.t = 0;
      justDied = true;
    }
    if (this.phase === 'dying') {
      this.t = Math.min(DEATH_DURATION, this.t + Math.max(0, dt));
      if (this.t >= DEATH_DURATION) this.phase = 'dead';
    }
    return { phase: this.phase, progress: this.t / DEATH_DURATION, justDied };
  }
}

/** Pose of the body parts for a sequence progress 0..1. */
export interface DeathPose {
  /** Scale of body and stalks (1 = full, 0 = gone). */
  bodyScale: number;
  /** Body slide backwards out of the shell, metres along its facing. */
  slide: number;
  /** Show X eyes. */
  xEyes: boolean;
}

/** Body pose during the sequence: stays put briefly, then shrinks and slides away. */
export function deathPose(progress: number): DeathPose {
  const p = Math.min(1, Math.max(0, progress));
  const k = Math.min(1, Math.max(0, (p - 0.25) / 0.75));
  const e = k * k * (3 - 2 * k);
  return { bodyScale: p >= 1 ? 0 : 1 - e, slide: -0.5 * e, xEyes: p > 0 && p < X_EYES_UNTIL };
}

/** Shell damage to show for a dead snail: at least the cracked level. */
export function deadShellDamage(damage: number): number {
  return Math.max(DEAD_MIN_DAMAGE, damage);
}

/** Offset of a floating shell from its resting place. */
export interface FloatOffset {
  /** Vertical lift in metres. */
  y: number;
  /** Roll about the facing axis, radians. */
  roll: number;
  /** Horizontal drift in metres. */
  dx: number;
  dz: number;
}

/**
 * Float offset of a drowned shell: it rises so its base sits just under the water surface
 * `waterY`, bobbing and drifting gently with `time` (seconds); `phase` (0..1) desynchronises
 * shells. A shell already above the surface only bobs.
 */
export function drownFloat(restY: number, waterY: number, time: number, phase = 0): FloatOffset {
  const w = time * 1.6 + phase * 6.283;
  return {
    y: Math.max(0, waterY - 0.05 - restY) + FLOAT_BOB * Math.sin(w),
    roll: 0.08 * Math.sin(w * 0.7 + 1),
    dx: 0.05 * Math.sin(time * 0.3 + phase * 5),
    dz: 0.05 * Math.cos(time * 0.27 + phase * 3),
  };
}

/** True when a death counts as a drowning (event flag, or resting below the waterline). */
export function isDrowned(flagged: boolean, y: number, waterY: number | null): boolean {
  return flagged || (waterY !== null && y < waterY - 0.05);
}
