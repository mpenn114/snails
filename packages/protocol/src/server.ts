import { z } from 'zod';
import { Colour, ErrorCode, MatchSettings, Role, TeamId, TerrainParams } from './common.js';
import { EventBatch } from './events.js';
import { Snapshot } from './snapshot.js';
import { PROTOCOL_VERSION } from './version.js';

/** Sent after a successful hello. */
export const Welcome = z.object({
  type: z.literal('welcome'),
  playerId: z.string(),
  roomCode: z.string(),
  /** Opaque token to present in `hello.sessionToken` to rejoin. */
  sessionToken: z.string(),
  role: Role,
  protocolVersion: z.literal(PROTOCOL_VERSION),
});

/** One lobby participant. */
export const LobbyPlayer = z.object({
  id: z.string(),
  name: z.string(),
  role: Role,
  teamId: TeamId.nullable(),
  colour: Colour.nullable(),
  ready: z.boolean(),
  connected: z.boolean(),
});
/** Lobby participant type. */
export type LobbyPlayer = z.infer<typeof LobbyPlayer>;

/** Lobby roster and settings. */
export const LobbyState = z.object({
  type: z.literal('lobbyState'),
  roomCode: z.string(),
  hostId: z.string().nullable(),
  players: z.array(LobbyPlayer),
  settings: MatchSettings,
});

/**
 * The match began. Terrain is generated deterministically from `terrain` + `seed`
 * (`generateTerrain` in core), so clients build an identical replica without a grid payload.
 */
export const MatchStarted = z.object({
  type: z.literal('matchStarted'),
  seed: z.number().int(),
  terrain: TerrainParams,
  settings: MatchSettings,
  teams: z.array(
    z.object({
      id: TeamId,
      name: z.string(),
      colour: Colour,
      snails: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  ),
});

/** Notifies that a turn started. */
export const TurnStart = z.object({
  type: z.literal('turnStart'),
  teamId: z.string(),
  snailId: z.string(),
  durationMs: z.number().nonnegative(),
});

/** Periodic turn clock update. */
export const TurnTimer = z.object({
  type: z.literal('turnTimer'),
  remainingMs: z.number().nonnegative(),
});

/** Heartbeat reply echoing `ping.t`. */
export const Pong = z.object({ type: z.literal('pong'), t: z.number() });

/** Error report. */
export const ErrorMessage = z.object({
  type: z.literal('error'),
  code: ErrorCode,
  message: z.string(),
  /** Set for `protocol_mismatch`. */
  expected: z.number().optional(),
  got: z.number().optional(),
});

/** Any message the server may send (snapshots and events go to display and controllers). */
export const ServerMessage = z.discriminatedUnion('type', [
  Welcome,
  LobbyState,
  MatchStarted,
  TurnStart,
  TurnTimer,
  Pong,
  Snapshot,
  EventBatch,
  ErrorMessage,
]);

export type ServerMessage = z.infer<typeof ServerMessage>;

/** Parses an unknown value as a server message; throws a ZodError on failure. */
export function parseServerMessage(raw: unknown): ServerMessage {
  return ServerMessage.parse(raw);
}
