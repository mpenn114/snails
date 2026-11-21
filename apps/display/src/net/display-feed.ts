import type { GameSnapshot, SimEvent } from '@snails/core';
import type { MatchInit } from '@snails/render';
import type { ServerMessage } from '@snails/protocol';

/**
 * What the display needs from the network layer. The M3 server work supplies the terrain
 * (`onInit`) once the protocol defines it; snapshots and events already arrive as
 * `stateSnapshot` / `gameEvent` messages.
 */
export interface DisplayFeed {
  /** Match start: initial terrain grid and water level. */
  onInit(init: MatchInit): void;
  /** Authoritative snapshot. */
  onSnapshot(snapshot: GameSnapshot): void;
  /** Sim events since the previous snapshot. */
  onEvents(events: SimEvent[]): void;
}

/**
 * Routes parsed server messages to a feed. The protocol types `state`/`payload` as `unknown`
 * (stub), so they are trusted here as snapshot / event shapes until M3 tightens them.
 */
export function routeServerMessage(feed: DisplayFeed, m: ServerMessage): void {
  if (m.type === 'stateSnapshot') {
    feed.onSnapshot(m.state as GameSnapshot);
  } else if (m.type === 'gameEvent') {
    const body = typeof m.payload === 'object' && m.payload !== null ? m.payload : {};
    feed.onEvents([{ ...body, type: m.event } as unknown as SimEvent]);
  }
}
