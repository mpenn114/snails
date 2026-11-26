/** Time (ms) of holding Fire from empty to a full power gauge. */
export const CHARGE_FULL_MS = 1800;
/** Holds shorter than this are taps: they do not shoot (guards against accidental touches). */
export const CHARGE_MIN_HOLD_MS = 160;
/** How often the gauge refreshes and the live power is sent (ms). */
export const CHARGE_TICK_MS = 50;

/** Power (0..1) after holding Fire for `heldMs`: a linear fill that stops at full. */
export function chargePower(heldMs: number): number {
  if (!Number.isFinite(heldMs) || heldMs <= 0) return 0;
  return Math.min(1, heldMs / CHARGE_FULL_MS);
}

/** Gauge label, e.g. `64%`. */
export function powerLabel(power: number): string {
  return `${Math.round(Math.min(1, Math.max(0, power)) * 100)}%`;
}

/** Messages the charge controller sends (a subset of the wire intents). */
export type ChargeMessage = { type: 'aim'; angle: number; power: number } | { type: 'fire' };

/** Everything the charge controller needs from its surroundings. */
export interface FireChargeDeps {
  now(): number;
  send(msg: ChargeMessage): void;
  /** Whether the selected weapon takes power (melee and utilities fire at once). */
  needsCharge(): boolean;
  /** Current aim elevation to send along with the power. */
  angle(): number;
  /** Live charge (also the final power): drives the gauge and the local aim view. */
  onCharge(angle: number, power: number): void;
  /** Charging ended: `fired` is false for a cancelled or too short hold. */
  onEnd(fired: boolean): void;
  /** Starts a repeating timer; returns its stop function. */
  every(fn: () => void, ms: number): () => void;
}

/** Press-and-hold fire controller. */
export interface FireCharge {
  /** Fire pressed (pointer or key down). */
  press(): void;
  /** Fire released: shoots with the charged power. */
  release(): void;
  /** Aborts without shooting (turn ended, focus lost). */
  cancel(): void;
  readonly charging: boolean;
}

/**
 * Press-and-hold power: the aim direction is set by dragging; while Fire is held the power
 * fills from 0 to 100%, the live value is relayed as `aim` intents (so the TV preview follows),
 * and releasing sends the final `aim` followed by `fire`. The server only ever sees ordinary
 * `aim` and `fire` intents, so the simulation stays deterministic.
 */
export function createFireCharge(deps: FireChargeDeps): FireCharge {
  let start: number | null = null;
  let stop: (() => void) | null = null;
  const power = (): number => chargePower(deps.now() - (start ?? deps.now()));
  const finish = (fired: boolean): void => {
    stop?.();
    stop = null;
    start = null;
    deps.onEnd(fired);
  };
  return {
    get charging() {
      return start !== null;
    },
    press() {
      if (start !== null) return;
      start = deps.now();
      if (!deps.needsCharge()) return;
      deps.onCharge(deps.angle(), 0);
      stop = deps.every(() => {
        const a = deps.angle();
        const p = power();
        deps.onCharge(a, p);
        deps.send({ type: 'aim', angle: a, power: p });
      }, CHARGE_TICK_MS);
    },
    release() {
      if (start === null) return;
      if (!deps.needsCharge()) {
        finish(true);
        deps.send({ type: 'fire' });
        return;
      }
      const held = deps.now() - start;
      if (held < CHARGE_MIN_HOLD_MS) return finish(false);
      const a = deps.angle();
      const p = power();
      deps.onCharge(a, p);
      deps.send({ type: 'aim', angle: a, power: p });
      deps.send({ type: 'fire' });
      finish(true);
    },
    cancel() {
      if (start !== null) finish(false);
    },
  };
}
