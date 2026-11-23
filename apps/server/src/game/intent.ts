import type { Command, Snail } from '@snails/core';
import type { ClientMessage } from '@snails/protocol';

/** Intent messages a controller may send during a match (a validated protocol subset). */
export type GameIntent = Extract<
  ClientMessage,
  { type: 'move' | 'jump' | 'aim' | 'selectWeapon' | 'fire' | 'endTurn' }
>;

/** Result of applying an intent. */
export type IntentResult = { ok: true } | { ok: false; reason: string };

/** Per-team mutable controller state kept between intents. */
export interface TeamControlState {
  direction: -1 | 0 | 1;
  weaponId: string;
}

const HALF_PI = Math.PI / 2;

/** Clamps a number into `[lo, hi]`; non-finite values become `lo`. */
export function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Converts an intent into a core command for the active snail, updating `control`.
 * Returns null for intents that only change controller state (selectWeapon).
 */
export function intentToCommand(
  intent: GameIntent,
  snail: Snail,
  teamId: string,
  control: TeamControlState,
): Command | null {
  switch (intent.type) {
    case 'move':
      control.direction = intent.direction === 'left' ? -1 : intent.direction === 'right' ? 1 : 0;
      return { type: 'move', snailId: snail.id, direction: control.direction };
    case 'jump':
      return { type: 'move', snailId: snail.id, direction: control.direction, jump: true };
    case 'aim':
      return {
        type: 'aim',
        snailId: snail.id,
        angle: clamp(intent.angle, -HALF_PI, HALF_PI),
        power: clamp(intent.power, 0, 1),
      };
    case 'fire':
      return { type: 'fire', snailId: snail.id, weaponId: control.weaponId };
    case 'endTurn':
      return { type: 'endTurn', teamId };
    case 'selectWeapon':
      return null;
  }
}
