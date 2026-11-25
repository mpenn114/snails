import type { SimEvent } from '@snails/core';
import type { CueRequest } from './recipes.js';

/** Health thresholds whose crossing plays the shell crack cue (damage layer steps). */
export const CRACK_THRESHOLDS: readonly number[] = [66, 33];

/** Options for the event mapper. */
export interface EventCueOptions {
  /** Shell material of a snail, for tap pitch and crystal chime; unknown yields the default. */
  materialOf?: (snailId: string) => string | undefined;
}

/** Maps simulation events to cue requests. */
export interface EventCueMapper {
  /** Cues for a batch of events (possibly none). */
  map(events: readonly SimEvent[]): CueRequest[];
}

function damaged(e: Extract<SimEvent, { type: 'snailDamaged' }>): CueRequest[] {
  const out: CueRequest[] = [{ id: 'hurt', amount: e.amount }];
  const before = e.remaining + e.amount;
  if (e.remaining > 0 && CRACK_THRESHOLDS.some((t) => before >= t && e.remaining < t)) {
    out.push({ id: 'crack' });
  }
  return out;
}

function hit(e: Extract<SimEvent, { type: 'projectileHit' }>, opts: EventCueOptions): CueRequest[] {
  if (!e.snailId) return [];
  const material = opts.materialOf?.(e.snailId);
  return [
    material === 'crystal'
      ? { id: 'crystalChime', material }
      : { id: 'shellTap', ...(material ? { material } : {}) },
  ];
}

/**
 * Maps one event to cues.
 * @param e simulation event
 * @param opts mapper options
 */
export function cuesForEvent(e: SimEvent, opts: EventCueOptions = {}): CueRequest[] {
  switch (e.type) {
    case 'projectileFired':
      return [{ id: 'fire', weaponId: e.weaponId }];
    case 'explosion':
      return [{ id: 'explosion', weaponId: e.weaponId, radius: e.radius }];
    case 'projectileHit':
      return hit(e, opts);
    case 'snailDamaged':
      return damaged(e);
    case 'snailDied':
      return [{ id: 'death' }];
    case 'snailDrowned':
      return [{ id: 'splash' }];
    case 'turnStarted':
      return e.teamId ? [{ id: 'turnStart' }] : [];
    case 'hillScored':
      return [{ id: 'hillScored' }];
    case 'researchCompleted':
      return [{ id: 'researchComplete' }];
    case 'matchEnded':
      return e.status === 'won' ? [{ id: 'victory' }] : [];
    default:
      return [];
  }
}

/**
 * Creates the event mapper.
 * @param opts mapper options
 */
export function createEventCueMapper(opts: EventCueOptions = {}): EventCueMapper {
  return { map: (events) => events.flatMap((e) => cuesForEvent(e, opts)) };
}
