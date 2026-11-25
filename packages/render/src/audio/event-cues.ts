import type { SimEvent } from '@snails/core';
import { crackStateFor } from '../snail/crack-damage.js';
import type { CueRequest } from './recipes.js';

/** Max health assumed when the mapper cannot look a snail up. */
export const DEFAULT_MAX_HEALTH = 100;

/** Options for the event mapper. */
export interface EventCueOptions {
  /** Shell material of a snail, for tap pitch and crystal chime; unknown yields the default. */
  materialOf?: (snailId: string) => string | undefined;
  /** Max health of a snail, so the crack cue matches the shell's crack state; default 100. */
  maxHealthOf?: (snailId: string) => number | undefined;
}

/** Maps simulation events to cue requests. */
export interface EventCueMapper {
  /** Cues for a batch of events (possibly none). */
  map(events: readonly SimEvent[]): CueRequest[];
}

function damaged(
  e: Extract<SimEvent, { type: 'snailDamaged' }>,
  opts: EventCueOptions,
): CueRequest[] {
  const out: CueRequest[] = [{ id: 'hurt', amount: e.amount }];
  const max = opts.maxHealthOf?.(e.snailId) ?? DEFAULT_MAX_HEALTH;
  if (max <= 0 || e.remaining <= 0) return out;
  const before = crackStateFor((e.remaining + e.amount) / max);
  if (crackStateFor(e.remaining / max) !== before) out.push({ id: 'crack' });
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
      return damaged(e, opts);
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
