import { z } from 'zod';

/** Machine-readable error codes carried by the server `error` message. */
export const ERROR_CODES = [
  'protocol_mismatch',
  'bad_message',
  'no_room',
  'room_full',
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

/** Match settings chosen by the host. */
export const MatchSettings = z.object({
  /** Seconds each turn lasts. */
  turnTimeSeconds: z.number().int().min(5).max(300),
  snailsPerTeam: z.number().int().min(1).max(8),
  /** Terrain and simulation seed (uint32). */
  seed: z.number().int().min(0).max(0xffffffff),
});
/** Match settings type. */
export type MatchSettings = z.infer<typeof MatchSettings>;

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
