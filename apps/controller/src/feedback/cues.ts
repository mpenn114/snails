import { decodeEventBatch, decodeSnapshot } from '@snails/protocol';
import type { ServerMessage } from '@snails/protocol';

/** A feedback cue. `own` marks cues that concern this player (haptics fire only for those). */
export interface Cue {
  kind: 'turnStart' | 'fire' | 'damage' | 'explosion' | 'tick';
  own: boolean;
}

/** Tunables for the planner. */
export interface CuePlannerOptions {
  /** Explosions closer than this (metres) to one of my snails count as "near me". */
  nearRadius?: number;
  /** Turn clock ticks start below this many ms remaining. */
  tickBelowMs?: number;
}

/** Stateful, pure mapper from server messages to cues. */
export interface CuePlanner {
  /** Returns the cues that `msg` triggers (possibly none). */
  plan(msg: ServerMessage): Cue[];
}

interface Pos {
  x: number;
  y: number;
  z: number;
}

/** Creates a planner for `playerId` (needs lobbyState for my team and matchStarted for my snails). */
export function createCuePlanner(
  playerId: string | null,
  opts: CuePlannerOptions = {},
): CuePlanner {
  const near = opts.nearRadius ?? 6;
  const tickBelow = opts.tickBelowMs ?? 5000;
  let myTeam: string | null = null;
  let activeTeam: string | null = null;
  let mySnails = new Set<string>();
  let positions = new Map<string, Pos>();
  let lastTickSec = Infinity;

  const nearMe = (p: Pos, radius: number): boolean =>
    [...mySnails].some((id) => {
      const s = positions.get(id);
      return s !== undefined && Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z) <= near + radius;
    });

  const fromEvents = (msg: Extract<ServerMessage, { type: 'eventBatch' }>): Cue[] => {
    const out: Cue[] = [];
    for (const e of decodeEventBatch(msg)) {
      if (e.type === 'projectileFired') out.push({ kind: 'fire', own: mySnails.has(e.snailId) });
      else if (e.type === 'explosion') {
        out.push({ kind: 'explosion', own: nearMe(e.position, e.radius) });
      } else if (e.type === 'snailDamaged' && mySnails.has(e.snailId)) {
        out.push({ kind: 'damage', own: true });
      }
    }
    return out;
  };

  const plan = (msg: ServerMessage): Cue[] => {
    switch (msg.type) {
      case 'lobbyState':
        myTeam = msg.players.find((p) => p.id === playerId)?.teamId ?? null;
        return [];
      case 'matchStarted': {
        const t = msg.teams.find((x) => x.id === myTeam);
        mySnails = new Set(t?.snails.map((s) => s.id));
        return [];
      }
      case 'snapshot':
        positions = new Map(decodeSnapshot(msg).snails.map((s) => [s.id, s.position]));
        return [];
      case 'turnStart':
        activeTeam = msg.teamId;
        lastTickSec = Infinity;
        return msg.teamId === myTeam ? [{ kind: 'turnStart', own: true }] : [];
      case 'turnTimer': {
        if (msg.remainingMs >= tickBelow || msg.remainingMs <= 0) return [];
        const sec = Math.ceil(msg.remainingMs / 1000);
        if (sec >= lastTickSec) return [];
        lastTickSec = sec;
        return [{ kind: 'tick', own: activeTeam !== null && activeTeam === myTeam }];
      }
      case 'eventBatch':
        return fromEvents(msg);
      default:
        return [];
    }
  };
  return { plan };
}
