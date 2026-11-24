import { MatchSettingsSchema } from '@snails/core';
import { z } from 'zod';

/** Machine-readable error codes carried by the server `error` message. */
export const ERROR_CODES = [
  'protocol_mismatch',
  'bad_message',
  'no_room',
  'room_full',
  'teams_full',
  'not_host',
  'not_in_lobby',
  'match_in_progress',
  'not_ready',
  'invalid_settings',
  'bad_session',
  'not_your_turn',
  'internal',
] as const;

/** Error code schema. */
export const ErrorCode = z.enum(ERROR_CODES);
/** Error code type. */
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Client role. */
export const Role = z.enum(['display', 'controller']);
/** Client role type. */
export type Role = z.infer<typeof Role>;

/** How phones map to teams: one phone per player, or a shared phone passed between teams. */
export const ControlMode = z.enum(['perPlayer', 'hotSeat']);
/** Control mode type. */
export type ControlMode = z.infer<typeof ControlMode>;

/**
 * Match settings chosen by the host: core's gameplay `MatchSettingsSchema` (the single source of
 * truth for ranges and defaults) plus the lobby-only fields. Missing gameplay fields default to
 * Classic, so a client that sends only a few of them still parses.
 */
export const MatchSettings = MatchSettingsSchema.extend({
  /** Terrain and simulation seed (uint32). */
  seed: z.number().int().min(0).max(0xffffffff).default(1),
  /** `perPlayer` (default): each phone is bound to its own team; `hotSeat`: phones may serve several teams. */
  controlMode: ControlMode.default('perPlayer'),
});
/** Match settings type. */
export type MatchSettings = z.infer<typeof MatchSettings>;
/** Match settings as a client may send them: every defaulted field optional. */
export type MatchSettingsInput = z.input<typeof MatchSettings>;

/** Terrain generator parameters (mirrors core's TerrainGenConfig; lengths in metres). */
export const TerrainParams = z.object({
  nx: z.number().int().positive(),
  ny: z.number().int().positive(),
  nz: z.number().int().positive(),
  cellSize: z.number().positive(),
  baseHeight: z.number(),
  hillAmplitude: z.number(),
  hillFrequency: z.number(),
  octaves: z.number().int().positive(),
  caveDensity: z.number(),
  caveFrequency: z.number(),
  waterLevel: z.number(),
  islandFalloff: z.boolean(),
});
/** Terrain parameter type. */
export type TerrainParams = z.infer<typeof TerrainParams>;

/** Team id constraints. */
export const TeamId = z.string().min(1).max(32);
/** Colour as a CSS-style string (e.g. `#ff8800`). */
export const Colour = z.string().min(1).max(16);

/** CPU skill levels a host may add (mirrors `DIFFICULTIES` in `@snails/ai`). */
export const CpuDifficulty = z.enum(['rookie', 'regular', 'veteran', 'mastermind']);
/** CPU skill level type. */
export type CpuDifficulty = z.infer<typeof CpuDifficulty>;
/** CPU play styles a host may add (mirrors `PERSONALITIES` in `@snails/ai`). */
export const CpuPersonality = z.enum(['aggressive', 'cautious', 'opportunist']);
/** CPU play style type. */
export type CpuPersonality = z.infer<typeof CpuPersonality>;
/** How a CPU team plays, as shown in the lobby. */
export const CpuInfo = z.object({ difficulty: CpuDifficulty, personality: CpuPersonality });
/** CPU description type. */
export type CpuInfo = z.infer<typeof CpuInfo>;
