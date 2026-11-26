import { TEAM_COLORS, hexToCss } from '@snails/render';
import { MatchSettings } from '@snails/protocol';
import { MAX_SNAIL_NAMES, sanitiseName } from '@snails/protocol';
import type { ControlMode, ErrorCode, LobbyPlayer, MatchSettingsInput } from '@snails/protocol';

/** Team slots (handed out by the server; hot-seat phones may toggle extra ones). */
export const TEAMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** Selectable colour palette (CSS hex). */
export const PALETTE: readonly string[] = TEAM_COLORS.map(hexToCss);

/** Ranges of the typed host inputs (a subset of the protocol schema, which `settingsError` also checks). */
export const SETTINGS_LIMITS = {
  turnTimeSeconds: { min: 10, max: 120 },
  snailsPerTeam: { min: 1, max: 8 },
} as const;

/**
 * Colours already claimed by someone else (lower-cased).
 * @param players lobby roster
 * @param meId this player's id
 */
export function takenColours(players: readonly LobbyPlayer[], meId: string): Set<string> {
  const out = new Set<string>();
  for (const p of players) if (p.id !== meId && p.colour) out.add(p.colour.toLowerCase());
  return out;
}

/**
 * Team slots already used by someone else (lower-cased), so a hot-seat phone cannot toggle them.
 * @param players lobby roster
 * @param meId this player's id
 */
export function takenTeams(players: readonly LobbyPlayer[], meId: string): Set<string> {
  const out = new Set<string>();
  for (const p of players)
    if (p.id !== meId) for (const t of playerTeams(p)) out.add(t.toLowerCase());
  return out;
}

/**
 * Cleans text typed into a name field (max {@link NAME_MAX} characters).
 * @param raw field value
 */
export function cleanName(raw: string): string {
  return sanitiseName(raw);
}

/**
 * Snail name fields to show: one per snail of the match (setting), capped at the protocol limit.
 * @param snailsPerTeam match setting
 */
export function snailFieldCount(snailsPerTeam: number | undefined): number {
  const n = Number.isInteger(snailsPerTeam) ? (snailsPerTeam as number) : 3;
  return Math.max(1, Math.min(MAX_SNAIL_NAMES, n));
}

/**
 * Names to send for the snail fields: cleaned entries, with the unseen tail (snails beyond the
 * visible fields) kept from the server's list so a smaller match does not lose them.
 * @param typed values of the visible fields
 * @param known the server's current list
 */
export function mergeSnailNames(typed: readonly string[], known: readonly string[]): string[] {
  const out = [...known];
  typed.forEach((t, i) => {
    out[i] = cleanName(t);
  });
  return out.slice(0, MAX_SNAIL_NAMES);
}

/** Every team a player controls (falls back to the primary `teamId`). */
export function playerTeams(p: Pick<LobbyPlayer, 'teamId' | 'teamIds'>): readonly string[] {
  if (p.teamIds && p.teamIds.length > 0) return p.teamIds;
  return p.teamId ? [p.teamId] : [];
}

/**
 * Why the host cannot start yet, or `undefined` when the match can start (mirrors the server's
 * `rooms/start-rules.ts`). In `hotSeat` one phone may cover several teams.
 */
export function startBlocker(
  players: readonly LobbyPlayer[],
  mode: ControlMode = 'perPlayer',
): string | undefined {
  const ctl = players.filter((p) => p.role === 'controller');
  if (ctl.some((p) => playerTeams(p).length === 0)) return 'Everyone must pick a team';
  if (mode === 'perPlayer' && ctl.some((p) => playerTeams(p).length > 1))
    return 'Each phone can play only one team';
  if (ctl.some((p) => !p.ready)) return 'Everyone must be ready';
  if (new Set(ctl.flatMap((p) => playerTeams(p))).size < 2) return 'Need at least two teams';
  return undefined;
}

/**
 * Whether the Start button should be enabled.
 * @param players lobby roster
 * @param hostId host player id
 * @param meId this player's id
 * @param settings the (possibly edited) settings
 */
export function canStart(
  players: readonly LobbyPlayer[],
  hostId: string | null,
  meId: string,
  settings: MatchSettingsInput,
): boolean {
  return (
    hostId === meId &&
    startBlocker(players, settings.controlMode) === undefined &&
    settingsError(settings) === undefined
  );
}

/**
 * Validates host settings.
 * @param s settings to check
 * @returns a message, or `undefined` when valid
 */
export function settingsError(s: MatchSettingsInput): string | undefined {
  const t = SETTINGS_LIMITS.turnTimeSeconds;
  const n = SETTINGS_LIMITS.snailsPerTeam;
  const turn = s.turnTimeSeconds ?? Number.NaN;
  const snails = s.snailsPerTeam ?? Number.NaN;
  const seed = s.seed ?? Number.NaN;
  if (!Number.isInteger(turn) || turn < t.min || turn > t.max)
    return `Turn time must be ${t.min}-${t.max} seconds`;
  if (!Number.isInteger(snails) || snails < n.min || snails > n.max)
    return `Snails per team must be ${n.min}-${n.max}`;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return 'Seed must be 0-4294967295';
  if (s.controlMode !== 'perPlayer' && s.controlMode !== 'hotSeat') return 'Unknown control mode';
  return MatchSettings.safeParse(s).success ? undefined : 'Invalid match settings';
}

/**
 * Parses a numeric text field; empty or invalid input becomes NaN.
 * @param text raw input value
 */
export function parseIntField(text: string): number {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN;
}

/**
 * Picks a random seed.
 * @param random injectable `[0,1)` source
 */
export function randomSeed(random: () => number): number {
  return Math.floor(random() * 0x100000000);
}

/** Friendly lobby error text for a protocol error code. */
export function lobbyErrorText(code: ErrorCode, message: string): string {
  switch (code) {
    case 'not_host':
      return 'Only the host can start the match';
    case 'teams_full':
      return 'All team slots are taken';
    case 'not_ready':
      return message || 'Everyone must be ready';
    case 'invalid_settings':
      return message || 'Invalid settings';
    case 'match_in_progress':
    case 'not_in_lobby':
      return 'The match has already started';
    default:
      return message || 'Something went wrong';
  }
}
