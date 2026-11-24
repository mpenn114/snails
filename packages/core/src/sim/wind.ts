import type { WindDefinition } from '../content/types.js';
import type { Rng } from '../rng.js';
import type { Wind } from '../state/types.js';
import type { SimContext } from './types.js';

/**
 * How wind changes between turns: `random` redraws both strength and direction, `drift` moves
 * a bounded amount from the previous wind, `off` keeps the wind at zero.
 */
export type WindMode = 'random' | 'drift' | 'off';

/** Wind rules used by {@link rollWind}. */
export interface WindConfig {
  /** Maximum strength in m/s^2 (the range is [0, maxStrength]). */
  maxStrength: number;
  /**
   * Largest change per turn in `drift` mode, as a fraction of `maxStrength` for strength and of
   * PI for direction. Clamped to [0, 1].
   */
  maxChangePerTurn: number;
  /** Which rolling rule to apply. */
  mode: WindMode;
  /** Lower bound of the strength in `random` mode (default 0). */
  minStrength?: number;
  /** Storm: the wind keeps drifting while projectiles are in flight (see `midFlightWindSystem`). */
  changesMidFlight?: boolean;
}

/** Default wind: fresh random wind each turn, up to 10 m/s^2. */
export const DEFAULT_WIND_CONFIG: WindConfig = {
  maxStrength: 10,
  maxChangePerTurn: 0.5,
  mode: 'random',
};

/** Wraps an angle into [-PI, PI). */
function wrapAngle(a: number): number {
  const twoPi = 2 * Math.PI;
  let x = (a + Math.PI) % twoPi;
  if (x < 0) x += twoPi;
  return x - Math.PI;
}

/** Clamps `v` into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Rolls the wind for a new turn from the previous wind and a seeded RNG (use the wind stream).
 * Pure apart from consuming draws from `rng`, so the same seed gives the same sequence.
 * - `random`: strength in [0, maxStrength), direction in [-PI, PI).
 * - `drift`: strength and direction change by at most `maxChangePerTurn` of their range,
 *   strength is kept in [0, maxStrength] and direction wrapped to [-PI, PI).
 * - `off`: zero strength (no RNG draws).
 * @param prev - Wind before the turn.
 * @param rng - Seeded RNG, normally `rngStreams.wind`.
 * @param config - Wind rules.
 */
export function rollWind(prev: Wind, rng: Rng, config: WindConfig): Wind {
  const max = Math.max(0, config.maxStrength);
  const change = clamp(config.maxChangePerTurn, 0, 1);
  switch (config.mode) {
    case 'off':
      return { strength: 0, direction: 0 };
    case 'drift': {
      const dS = change * max;
      const dA = change * Math.PI;
      return {
        strength: clamp(prev.strength + rng.range(-dS, dS), 0, max),
        direction: wrapAngle(prev.direction + rng.range(-dA, dA)),
      };
    }
    case 'random': {
      const min = clamp(config.minStrength ?? 0, 0, max);
      return { strength: min + rng.range(0, max - min), direction: rng.range(-Math.PI, Math.PI) };
    }
  }
}

/** Ticks between mid-flight wind changes (about one second at the fixed step). */
const MID_FLIGHT_INTERVAL_TICKS = 60;

/**
 * Wind rules for a content wind definition: `off` for a zero range, otherwise a fresh random
 * wind between its strengths each turn; `changesMidFlight` is carried over.
 */
export function windConfigFromDefinition(def: WindDefinition): WindConfig {
  return {
    maxStrength: def.maxStrength,
    minStrength: def.minStrength,
    maxChangePerTurn: 0.3,
    mode: def.maxStrength <= 0 ? 'off' : 'random',
    changesMidFlight: def.changesMidFlight,
  };
}

/**
 * System for storms: while projectiles are in flight, the wind drifts a little about once a
 * second (kept inside the preset's range) and `windChanged` is emitted. Uses the wind stream.
 */
export function midFlightWindSystem(config: WindConfig): (ctx: SimContext) => void {
  const min = config.minStrength ?? 0;
  return (ctx) => {
    if (config.changesMidFlight !== true || ctx.state.projectiles.length === 0) return;
    if (ctx.state.tick % MID_FLIGHT_INTERVAL_TICKS !== 0) return;
    const next = rollWind(ctx.state.wind, ctx.rng.wind, { ...config, mode: 'drift' });
    ctx.state.wind = { strength: Math.max(min, next.strength), direction: next.direction };
    ctx.emit({
      type: 'windChanged',
      strength: ctx.state.wind.strength,
      direction: ctx.state.wind.direction,
    });
  };
}
