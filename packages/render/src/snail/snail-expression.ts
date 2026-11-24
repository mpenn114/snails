/**
 * Snail expressions (M7-09): eyelids, pupils and stalks reacting to game events. Pure envelope
 * functions plus a small per-snail state machine. Cosmetic only.
 */
import type { SimEvent } from '@snails/core';

/** What a snail reacts to. */
export type ExpressionKind = 'hit' | 'fire' | 'scare' | 'cheer' | 'sad';

/** The face pose handed to the mesh each frame. */
export interface ExpressionPose {
  /** Eyelid closure per eye, 0 = open, 1 = shut (squint is about 0.5). */
  lid: [number, number];
  /** Extra stalk droop in radians (positive bends the stalks forward and down). */
  droop: number;
  /** Stalk retraction, 0 = out, 1 = pulled in. */
  retract: number;
  /** Stalk stretch (alert), 0..1. */
  stretch: number;
  /** Pupil scale (surprise shrinks it, worry widens it). */
  pupil: number;
  /** Pupil offset in eye space (x forward, y up), as a fraction of the eyeball radius. */
  look: [number, number];
}

/** Rest face. */
export const REST_FACE: Readonly<ExpressionPose> = {
  lid: [0, 0],
  droop: 0,
  retract: 0,
  stretch: 0,
  pupil: 1,
  look: [0, 0],
};

/** Seconds each reaction lasts. */
export const EXPRESSION_DURATION: Readonly<Record<ExpressionKind, number>> = {
  hit: 1.1,
  fire: 0.8,
  scare: 1.2,
  cheer: 2.6,
  sad: 3,
};

/** Blink length in seconds. */
export const BLINK_TIME = 0.16;
/** Blink interval range in seconds. */
export const BLINK_INTERVAL: readonly [number, number] = [2.2, 5.5];

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Trapezoid envelope: rises over `attack`, holds until `hold`, falls to 0 at `end` (seconds). */
export function envelope(t: number, attack: number, hold: number, end: number): number {
  if (t <= 0 || t >= end) return 0;
  if (t < attack) return t / attack;
  if (t <= hold) return 1;
  const k = clamp01(1 - (t - hold) / (end - hold));
  return k * k * (3 - 2 * k);
}

/** Blink closure at `t` seconds into a blink (a quick close and slower open). */
export function blinkAmount(t: number): number {
  if (t <= 0 || t >= BLINK_TIME) return 0;
  const half = BLINK_TIME * 0.4;
  return t < half ? t / half : 1 - (t - half) / (BLINK_TIME - half);
}

/** Pose of one reaction `t` seconds after it started (strength scales the effect). */
export function reactionPose(kind: ExpressionKind, t: number, strength = 1): ExpressionPose {
  const s = clamp01(strength);
  const face: ExpressionPose = { ...REST_FACE, lid: [0, 0], look: [0, 0] };
  switch (kind) {
    case 'hit': {
      const e = envelope(t, 0.04, 0.5, EXPRESSION_DURATION.hit) * s;
      face.lid = [0.42 * e, 0.42 * e];
      face.droop = 0.5 * e;
      face.pupil = 1 - 0.3 * e;
      face.look = [0, -0.25 * e];
      return face;
    }
    case 'fire': {
      const e = envelope(t, 0.05, 0.35, EXPRESSION_DURATION.fire) * s;
      face.stretch = e;
      face.pupil = 1 - 0.35 * e;
      return face;
    }
    case 'scare': {
      const e = envelope(t, 0.07, 0.55, EXPRESSION_DURATION.scare) * s;
      face.retract = e;
      face.lid = [0.3 * e, 0.3 * e];
      face.pupil = 1 - 0.25 * e;
      return face;
    }
    case 'cheer': {
      const e = envelope(t, 0.15, 1.8, EXPRESSION_DURATION.cheer) * s;
      face.lid = [0.35 * e, 0.35 * e];
      face.stretch = 0.6 * e * (0.5 + 0.5 * Math.sin(t * 9));
      face.look = [0, 0.3 * e];
      return face;
    }
    case 'sad': {
      const e = envelope(t, 0.4, 2.2, EXPRESSION_DURATION.sad) * s;
      face.droop = 0.7 * e;
      face.lid = [0.35 * e, 0.35 * e];
      face.look = [0, -0.35 * e];
      return face;
    }
  }
}

/** Merges two face poses: the stronger of each channel wins (closure, droop, retract, stretch). */
export function mergeFaces(a: ExpressionPose, b: ExpressionPose): ExpressionPose {
  return {
    lid: [Math.max(a.lid[0], b.lid[0]), Math.max(a.lid[1], b.lid[1])],
    droop: Math.max(a.droop, b.droop),
    retract: Math.max(a.retract, b.retract),
    stretch: Math.max(a.stretch, b.stretch),
    pupil: Math.min(a.pupil, b.pupil),
    look: Math.abs(a.look[1]) >= Math.abs(b.look[1]) ? a.look : b.look,
  };
}

/** Distance within which an explosion makes a snail pull its stalks in, for a blast radius. */
export function scareRange(radius: number): number {
  return radius * 2 + 1.5;
}

/** Scare strength 0..1 of an explosion `distance` away from a snail. */
export function scareStrength(distance: number, radius: number): number {
  const range = scareRange(radius);
  return distance >= range ? 0 : clamp01(1 - distance / range) ** 0.6;
}

/** A reaction to apply to snails, produced from an event by {@link reactionsForEvent}. */
export interface Reaction {
  /** Snail the reaction targets, or `team` / `near` for fan-out cases. */
  snailId?: string;
  /** Every snail of this team. */
  teamId?: string;
  /** Every snail near this point (scare strength falls off with distance). */
  near?: { x: number; y: number; z: number; radius: number };
  /** Reaction kind. */
  kind: ExpressionKind;
  /** Strength 0..1 (ignored for `near`, computed from the distance). */
  strength: number;
}

/** Maps a sim event to the cosmetic reactions it causes (empty for most events). */
export function reactionsForEvent(e: SimEvent): Reaction[] {
  switch (e.type) {
    case 'snailDamaged':
      return [{ snailId: e.snailId, kind: 'hit', strength: clamp01(0.4 + e.amount / 40) }];
    case 'projectileFired':
      return [{ snailId: e.snailId, kind: 'fire', strength: 1 }];
    case 'explosion':
      return [{ near: { ...e.position, radius: e.radius }, kind: 'scare', strength: 1 }];
    case 'matchEnded':
      return e.winnerTeamId ? [{ teamId: e.winnerTeamId, kind: 'cheer', strength: 1 }] : [];
    default:
      return [];
  }
}

/** Per-snail expression state: running reactions plus an idle blink schedule. */
export class SnailExpression {
  private readonly active: { kind: ExpressionKind; t: number; strength: number }[] = [];
  private blinkIn: number;
  private blinkT = 0;
  private rng: number;

  /** @param seed - Seeds the blink schedule so snails do not blink in unison. */
  constructor(seed = 1) {
    this.rng = seed >>> 0 || 1;
    this.blinkIn = this.nextBlink();
  }

  private random(): number {
    // xorshift32: visual only, independent of the simulation.
    let x = this.rng;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return this.rng / 4294967296;
  }

  private nextBlink(): number {
    return BLINK_INTERVAL[0] + (BLINK_INTERVAL[1] - BLINK_INTERVAL[0]) * this.random();
  }

  /** Starts (or restarts) a reaction. */
  trigger(kind: ExpressionKind, strength = 1): void {
    const same = this.active.find((a) => a.kind === kind);
    if (same) {
      same.t = 0;
      same.strength = Math.max(strength, same.strength * 0.5);
    } else this.active.push({ kind, t: 0, strength });
  }

  /** True while any reaction is running. */
  get busy(): boolean {
    return this.active.length > 0;
  }

  /**
   * Advances by `dt` and returns the face. `worry` (0..1) is a standing droop for low health;
   * blinking is suppressed while a reaction already closes the lids.
   */
  update(dt: number, worry = 0): ExpressionPose {
    const d = Math.min(Math.max(dt, 0), 0.1);
    let face: ExpressionPose = { ...REST_FACE, lid: [0, 0], look: [0, 0] };
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i] as { kind: ExpressionKind; t: number; strength: number };
      a.t += d;
      if (a.t >= EXPRESSION_DURATION[a.kind]) this.active.splice(i, 1);
      else face = mergeFaces(face, reactionPose(a.kind, a.t, a.strength));
    }
    this.blinkIn -= d;
    if (this.blinkIn <= 0 && this.blinkT === 0) this.blinkT = 1e-6;
    if (this.blinkT > 0) {
      this.blinkT += d;
      if (this.blinkT >= BLINK_TIME) {
        this.blinkT = 0;
        this.blinkIn = this.nextBlink();
      }
    }
    const b = blinkAmount(this.blinkT);
    const w = clamp01(worry);
    face.lid = [Math.max(face.lid[0], b, w * 0.2), Math.max(face.lid[1], b, w * 0.2)];
    face.droop = Math.max(face.droop, w * 0.25);
    return face;
  }
}
