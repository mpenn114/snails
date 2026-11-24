import type { GameSnapshot } from '@snails/core';

/** One team's health bar. */
export interface TeamBar {
  teamId: string;
  name: string;
  colour: string;
  /** Total health of living snails. */
  health: number;
  /** Total max health (bar denominator). */
  maxHealth: number;
  /** 0..1 fill. */
  fraction: number;
  active: boolean;
}

/** Everything the HUD shows. */
export interface HudModel {
  /** Name of the team whose turn it is, or null. */
  turnTeam: string | null;
  turnColour: string | null;
  /** Active snail name, or null. */
  turnSnail: string | null;
  /** Whole seconds left in the turn. */
  timerSeconds: number;
  bars: TeamBar[];
  /** Set once the match ended: winning team (`name` null for a draw). */
  winner: { name: string | null; colour: string | null } | null;
  /** Standing announcement (sudden death is on), or null. */
  notice: string | null;
}

/** An empty HUD. */
export const EMPTY_HUD: HudModel = {
  turnTeam: null,
  turnColour: null,
  turnSnail: null,
  timerSeconds: 0,
  bars: [],
  winner: null,
  notice: null,
};

/** Builds the HUD model from a renderable snapshot; `timerMs` overrides the snapshot clock. */
export function hudFromSnapshot(
  s: GameSnapshot,
  timerMs: number | null,
  winner: HudModel['winner'],
  notice: string | null = null,
): HudModel {
  const activeTeam = s.teams.find((t) => t.id === s.turn.activeTeamId);
  const activeSnail = activeTeam?.snails.find((n) => n.id === s.turn.activeSnailId);
  const bars = s.teams.map((t): TeamBar => {
    const health = t.snails.reduce((a, n) => a + (n.alive ? Math.max(0, n.health) : 0), 0);
    const maxHealth = t.snails.reduce((a, n) => a + n.maxHealth, 0);
    return {
      teamId: t.id,
      name: t.name,
      colour: t.colour,
      health,
      maxHealth,
      fraction: maxHealth > 0 ? Math.min(1, health / maxHealth) : 0,
      active: t.id === s.turn.activeTeamId,
    };
  });
  return {
    turnTeam: activeTeam?.name ?? null,
    turnColour: activeTeam?.colour ?? null,
    turnSnail: activeSnail?.name ?? null,
    timerSeconds: Math.max(0, Math.ceil((timerMs ?? s.turn.timeRemaining * 1000) / 1000)),
    bars,
    winner,
    notice,
  };
}

/** Announcement text for a `suddenDeathStarted` event. */
export function suddenDeathNotice(kind: 'water' | 'drain' | 'both'): string {
  const what = {
    water: 'The water is rising!',
    drain: 'Health is draining!',
    both: 'The water is rising and health is draining!',
  };
  return `Sudden death! ${what[kind]}`;
}
