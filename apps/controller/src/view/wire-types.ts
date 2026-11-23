import type { ServerMessage } from '@snails/protocol';

/** The `matchStarted` server message. */
export type MatchStarted = Extract<ServerMessage, { type: 'matchStarted' }>;
