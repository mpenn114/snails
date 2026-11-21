import { EventBus, TurnManager } from '@snails/core';
import type { GameEvents, Team } from '@snails/core';

/**
 * Authoritative game session (stub). A real implementation will step the core simulation at a
 * fixed timestep, apply controller intents, and broadcast snapshots and events to ALL clients
 * (display and controllers, see ADR-0008).
 */
export class GameSession {
  readonly events = new EventBus<GameEvents>();
  private readonly turns: TurnManager;

  /** @param teams - Teams participating in this session. */
  constructor(teams: Team[]) {
    this.turns = new TurnManager(teams);
  }

  /** Starts the next turn and emits turnStarted. Returns false if nobody is alive. */
  startNextTurn(): boolean {
    const info = this.turns.next();
    if (!info) return false;
    this.events.emit('turnStarted', { teamId: info.team.id, snailId: info.snail.id });
    return true;
  }

  /** Advances time; ends the turn on timeout. */
  tick(dtMs: number): void {
    if (this.turns.tick(dtMs)) this.startNextTurn();
  }
}
