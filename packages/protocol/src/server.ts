import { z } from 'zod';
import {
  Colour,
  CpuInfo,
  ErrorCode,
  MatchSettings,
  Role,
  TeamId,
  TerrainParams,
} from './common.js';
import { EventBatch, TerrainHistory } from './events.js';
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
  /** Every team this player controls (hot-seat may list several); `teamId` is the first. */
  teamIds: z.array(TeamId).default([]),
  colour: Colour.nullable(),
  /** Team name chosen by the player (absent for CPUs, whose `name` is the team name). */
  teamName: z.string().optional(),
  /** The player's snail names in order (absent for CPUs). */
  snailNames: z.array(z.string()).optional(),
  ready: z.boolean(),
  connected: z.boolean(),
  /** Present for a CPU team's lobby entry (no phone behind it). */
  cpu: CpuInfo.optional(),
});
/** Lobby participant type. */
export type LobbyPlayer = z.infer<typeof LobbyPlayer>;

/** Lobby roster and settings. */
export const LobbyState = z.object({
  type: z.literal('lobbyState'),
  roomCode: z.string(),
  hostId: z.string().nullable(),
  /** `match` while a match runs, so a mid-match roster update is not mistaken for a return to the lobby. */
  phase: z.enum(['lobby', 'match']),
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
  /** The controller that commands this turn (rotates within a team); omitted if none. */
  activePlayerId: z.string().optional(),
});

/** Periodic turn clock update. */
export const TurnTimer = z.object({
  type: z.literal('turnTimer'),
  remainingMs: z.number().nonnegative(),
});

/** Live aim of the active snail, relayed (throttled) to the other clients for mirroring. */
export const AimPreview = z.object({
  type: z.literal('aimPreview'),
  snailId: z.string(),
  /** Weapon the active team currently has selected. */
  weaponId: z.string(),
  /** That weapon's launch parameters (so displays can preview the arc without content data). */
  launch: z.object({
    minSpeed: z.number(),
    maxSpeed: z.number(),
    gravityScale: z.number(),
    windScale: z.number(),
    projectileRadius: z.number(),
  }),
  /**
   * That weapon's motion parameters (`{ kind: 'drill', length, ... }`), omitted for plain
   * ballistic weapons, so displays preview a drill as a straight line.
   */
  motion: z.object({ kind: z.string() }).passthrough().optional(),
  /**
   * Set for melee weapons (no projectile, no power): displays show only a strike marker
   * `reach` metres ahead instead of an arc.
   */
  melee: z.object({ reach: z.number().positive() }).optional(),
  angle: z.number().min(-Math.PI).max(Math.PI),
  power: z.number().min(0).max(1),
});

/** One team's weapon stock and locks in an {@link Inventory} message. */
export const TeamInventory = z.object({
  teamId: z.string(),
  /** Uses left per finite weapon (`weaponId -> count`); infinite weapons are absent. */
  stock: z.record(z.string(), z.number().int().nonnegative()),
  /** Weapons the team cannot use yet (`weaponId -> required technology id`). */
  locked: z.record(z.string(), z.string()),
});

/**
 * Every team's inventory. Sent at match start, to rejoining members, and whenever any stock or
 * lock changes (so phones know their own stock without reading snapshots).
 */
export const Inventory = z.object({
  type: z.literal('inventory'),
  teams: z.array(TeamInventory),
});

/** An {@link Inventory} message. */
export type Inventory = z.infer<typeof Inventory>;

/** Heartbeat reply echoing `ping.t`. */
export const Pong = z.object({ type: z.literal('pong'), t: z.number() });

/**
 * Sent only to the sender of an intent that carried `seq`, right after the server applied it.
 * `serverTick` is the simulation tick at which it was applied; the effect is visible in the first
 * snapshot with `tick > serverTick`. Chosen over per-player `lastAppliedSeq` in snapshots so the
 * shared snapshot stays identical for every client.
 */
export const Ack = z.object({
  type: z.literal('ack'),
  seq: z.number().int().nonnegative(),
  serverTick: z.number().int().nonnegative(),
});

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
  AimPreview,
  Inventory,
  Pong,
  Ack,
  Snapshot,
  EventBatch,
  TerrainHistory,
  ErrorMessage,
]);

export type ServerMessage = z.infer<typeof ServerMessage>;

/** Parses an unknown value as a server message; throws a ZodError on failure. */
export function parseServerMessage(raw: unknown): ServerMessage {
  return ServerMessage.parse(raw);
}
