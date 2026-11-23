import type { GameSnapshot, SimEvent } from '@snails/core';

/** Aggregated health of one team. */
export interface TeamHealth {
  teamId: string;
  name: string;
  colour: string;
  /** Sum of living snails' hp. */
  hp: number;
  /** Sum of all snails' max hp (fixed denominator so bars shrink as damage lands). */
  maxHp: number;
  /** hp / maxHp in 0..1. */
  fraction: number;
  active: boolean;
}

/**
 * Sums snail health per team, flagging the team whose turn it is. Snails that died may vanish
 * from snapshots, so pass a persistent `maxSeen` map to keep each team's denominator.
 */
export function teamHealth(
  snapshot: GameSnapshot,
  maxSeen: Map<string, number> = new Map(),
): TeamHealth[] {
  return snapshot.teams.map((t) => {
    let hp = 0;
    let maxHp = 0;
    for (const s of t.snails) {
      maxHp += s.maxHealth;
      if (s.alive) hp += Math.max(0, s.health);
    }
    maxHp = Math.max(maxHp, maxSeen.get(t.id) ?? 0);
    maxSeen.set(t.id, maxHp);
    return {
      teamId: t.id,
      name: t.name,
      colour: t.colour,
      hp: Math.round(hp),
      maxHp,
      fraction: maxHp > 0 ? Math.min(1, hp / maxHp) : 0,
      active: t.id === snapshot.turn.activeTeamId,
    };
  });
}

/** Who is up: active team and snail names, or null between turns. */
export function activeLabel(snapshot: GameSnapshot): { team: string; snail: string } | null {
  const id = snapshot.turn.activeSnailId;
  for (const t of snapshot.teams) {
    const s = t.snails.find((x) => x.id === id);
    if (s) return { team: t.name, snail: s.name };
  }
  return null;
}

const COMPASS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'] as const;

/** Short wind text such as "3.2 NW" (compass relative to the map, +X = E, -Z = N). */
export function windLabel(wind: { strength: number; direction: number }): string {
  if (Math.abs(wind.strength) < 0.05) return 'Calm';
  const turn = Math.PI * 2;
  const a = ((wind.direction % turn) + turn) % turn;
  const dir = COMPASS[Math.round(a / (turn / 8)) % 8] as string;
  return `${Math.abs(wind.strength).toFixed(1)} ${dir}`;
}

/** Kill-feed sentence for a death, or null when the event is not a death. */
export function killText(
  event: SimEvent,
  name: (snailId: string) => string,
  killerOf: (victimId: string) => string | null,
): string | null {
  if (event.type !== 'snailDied') return null;
  const victim = name(event.snailId);
  const killer = killerOf(event.snailId);
  if (event.cause === 'drown') return `${victim} drowned`;
  if (event.cause === 'void') return `${victim} fell out of the world`;
  if (killer && killer !== event.snailId) return `${killer} took out ${victim}`;
  return event.cause === 'fall' ? `${victim} fell to their death` : `${victim} blew themself up`;
}

interface FeedEntry {
  text: string;
  expires: number;
}

/** Short-lived list of kill messages that remembers the last damage dealer per snail. */
export class KillFeed {
  private entries: FeedEntry[] = [];
  private readonly lastHit = new Map<string, string>();

  constructor(
    private readonly ttlMs = 6000,
    private readonly capacity = 4,
  ) {}

  /** Consumes events; `name` resolves a snail id to a display name. */
  push(events: readonly SimEvent[], now: number, name: (id: string) => string): void {
    for (const e of events) {
      if (e.type === 'snailDamaged' && e.sourceSnailId)
        this.lastHit.set(e.snailId, e.sourceSnailId);
      const text = killText(e, name, (v) => {
        const k = this.lastHit.get(v);
        return k ? name(k) : null;
      });
      if (text) this.entries.push({ text, expires: now + this.ttlMs });
    }
    this.entries = this.entries.slice(-this.capacity);
  }

  /** Messages still on screen at `now`, oldest first. */
  visible(now: number): string[] {
    this.entries = this.entries.filter((e) => e.expires > now);
    return this.entries.map((e) => e.text);
  }
}

/** Snail display name lookup over a roster (falls back to the id). */
export function rosterNamer(
  teams: readonly { snails: readonly { id: string; name: string }[] }[],
): (id: string) => string {
  const names = new Map<string, string>();
  for (const t of teams) for (const s of t.snails) names.set(s.id, s.name);
  return (id) => names.get(id) ?? id;
}
