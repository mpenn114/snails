import type { Snail, Team } from '../state/types.js';

/** Identifies whose turn it is. */
export interface TurnInfo {
  team: Team;
  snail: Snail;
}

/** Cycles through teams, and each team's snails, skipping dead snails. */
export class TurnManager {
  private teamIndex = -1;
  private snailCursor = new Map<string, number>();
  private remainingMs = 0;

  /** @param teams - Teams in turn order. @param turnLimitMs - Turn duration in ms. */
  constructor(
    private readonly teams: Team[],
    private readonly turnLimitMs = 45_000,
  ) {}

  /** Advances to the next living snail and resets the timer. Returns null if no one is alive. */
  next(): TurnInfo | null {
    for (let i = 0; i < this.teams.length; i++) {
      this.teamIndex = (this.teamIndex + 1) % this.teams.length;
      const team = this.teams[this.teamIndex];
      const snail = team && this.pickSnail(team);
      if (team && snail) {
        this.remainingMs = this.turnLimitMs;
        return { team, snail };
      }
    }
    return null;
  }

  /** Timer stub: subtracts elapsed time and returns true when the turn has expired. */
  tick(dtMs: number): boolean {
    this.remainingMs = Math.max(0, this.remainingMs - dtMs);
    return this.remainingMs === 0;
  }

  /** Milliseconds left in the current turn. */
  get timeLeftMs(): number {
    return this.remainingMs;
  }

  private pickSnail(team: Team): Snail | undefined {
    const n = team.snails.length;
    const start = this.snailCursor.get(team.id) ?? 0;
    for (let i = 0; i < n; i++) {
      const idx = (start + i) % n;
      const snail = team.snails[idx];
      if (snail && snail.health > 0) {
        this.snailCursor.set(team.id, (idx + 1) % n);
        return snail;
      }
    }
    return undefined;
  }
}
