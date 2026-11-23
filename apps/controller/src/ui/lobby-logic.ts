import type { ErrorCode, LobbyPlayer, MatchSettings } from '@snails/protocol';

/** Selectable team ids. */
export const TEAMS = ['A', 'B', 'C', 'D'] as const;

/** Selectable colour palette (CSS hex). */
export const PALETTE = [
  '#e53935',
  '#1e88e5',
  '#43a047',
  '#fdd835',
  '#8e24aa',
  '#fb8c00',
  '#00acc1',
  '#ec407a',
] as const;

/** Allowed ranges for host settings (mirrors the protocol schema). */
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

/** Why the host cannot start yet, or `undefined` when the match can start (mirrors room.ts). */
export function startBlocker(players: readonly LobbyPlayer[]): string | undefined {
  const ctl = players.filter((p) => p.role === 'controller');
  if (ctl.some((p) => !p.teamId)) return 'Everyone must pick a team';
  if (ctl.some((p) => !p.ready)) return 'Everyone must be ready';
  if (new Set(ctl.map((p) => p.teamId)).size < 2) return 'Need at least two teams';
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
  settings: MatchSettings,
): boolean {
  return (
    hostId === meId && startBlocker(players) === undefined && settingsError(settings) === undefined
  );
}

/**
 * Validates host settings.
 * @param s settings to check
 * @returns a message, or `undefined` when valid
 */
export function settingsError(s: MatchSettings): string | undefined {
  const t = SETTINGS_LIMITS.turnTimeSeconds;
  const n = SETTINGS_LIMITS.snailsPerTeam;
  if (
    !Number.isInteger(s.turnTimeSeconds) ||
    s.turnTimeSeconds < t.min ||
    s.turnTimeSeconds > t.max
  )
    return `Turn time must be ${t.min}-${t.max} seconds`;
  if (!Number.isInteger(s.snailsPerTeam) || s.snailsPerTeam < n.min || s.snailsPerTeam > n.max)
    return `Snails per team must be ${n.min}-${n.max}`;
  if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed > 0xffffffff)
    return 'Seed must be 0-4294967295';
  return undefined;
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
