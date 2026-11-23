import type { GameSnapshot, SimEvent } from '@snails/core';
import type { MatchInit } from '@snails/render';
import { decodeEventBatch, decodeSnapshot } from '@snails/protocol';
import type { DecodedSnapshot, ServerMessage } from '@snails/protocol';

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
  /** Compact snapshot from the wire (optional until the full-state mapping lands). */
  onCompactSnapshot?(snapshot: DecodedSnapshot): void;
  /** Sim events since the previous snapshot. */
  onEvents(events: SimEvent[]): void;
}

/**
 * Routes parsed server messages to a feed. Event batches are decoded to core `SimEvent`s
 * (structurally identical). Compact snapshots are decoded and handed to the optional
 * `onCompactSnapshot` hook; mapping them onto a full `GameSnapshot` is follow-up work.
 */
export function routeServerMessage(feed: DisplayFeed, m: ServerMessage): void {
  if (m.type === 'snapshot') {
    feed.onCompactSnapshot?.(decodeSnapshot(m));
  } else if (m.type === 'eventBatch') {
    feed.onEvents(decodeEventBatch(m) as unknown as SimEvent[]);
  }
}
