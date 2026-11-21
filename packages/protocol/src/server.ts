import { z } from 'zod';
import { PROTOCOL_VERSION } from './version.js';

/** Sent after a successful hello. */
export const Welcome = z.object({
  type: z.literal('welcome'),
  playerId: z.string(),
  roomCode: z.string(),
  protocolVersion: z.literal(PROTOCOL_VERSION),
});
/** Lobby roster. */
export const LobbyState = z.object({
  type: z.literal('lobbyState'),
  roomCode: z.string(),
  players: z.array(z.object({ id: z.string(), name: z.string(), role: z.enum(['controller', 'display']) })),
});
/** Notifies that a turn started. */
export const TurnStart = z.object({
  type: z.literal('turnStart'),
  teamId: z.string(),
  snailId: z.string(),
  durationMs: z.number().nonnegative(),
});
/** Stub for authoritative state snapshots. */
export const StateSnapshot = z.object({
  type: z.literal('stateSnapshot'),
  tick: z.number().int().nonnegative(),
  state: z.unknown(),
});
/** Error report. */
export const ErrorMessage = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
});

/** Any message the server may send. */
export const ServerMessage = z.discriminatedUnion('type', [
  Welcome,
  LobbyState,
  TurnStart,
  StateSnapshot,
  ErrorMessage,
]);

export type ServerMessage = z.infer<typeof ServerMessage>;

/** Parses an unknown value as a server message; throws a ZodError on failure. */
export function parseServerMessage(raw: unknown): ServerMessage {
  return ServerMessage.parse(raw);
}
