import { MatchSettings, type LobbyPlayer, type MatchSettingsInput } from '@snails/protocol';

/** Subset of `GET /api/info` the display needs. */
export interface InfoLike {
  joinUrl: string;
  primaryIp: string;
  port: number;
  /** Whether a real LAN address was found (false = loopback fallback). */
  lanFound: boolean;
  /** Server `process.platform`. */
  platform: string;
  /** All LAN candidates, best first. */
  lanIps: string[];
}

/** Players sharing a team (or `null` for those without one). */
export interface TeamGroup {
  teamId: string | null;
  players: LobbyPlayer[];
}

/**
 * Builds the phone join URL for a room from the server's base join URL.
 * @param baseUrl `joinUrl` from `/api/info` (e.g. `http://192.168.1.2:3000/`)
 * @param roomCode room code
 */
export function buildJoinUrl(baseUrl: string, roomCode: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('room', roomCode);
  return url.toString();
}

/**
 * Fetches and validates `/api/info`.
 * @param fetchFn injectable fetch
 * @returns the info, or `undefined` when unavailable or malformed
 */
export async function fetchInfo(
  fetchFn: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>,
): Promise<InfoLike | undefined> {
  try {
    const res = await fetchFn('/api/info');
    if (!res.ok) return undefined;
    const body = (await res.json()) as Partial<InfoLike>;
    if (typeof body.joinUrl !== 'string' || typeof body.primaryIp !== 'string') return undefined;
    const lanIps = Array.isArray(body.lanIps)
      ? body.lanIps.filter((x): x is string => typeof x === 'string')
      : [body.primaryIp];
    return {
      joinUrl: body.joinUrl,
      primaryIp: body.primaryIp,
      port: Number(body.port),
      lanFound: body.lanFound ?? !/^(127\.|localhost)/.test(body.primaryIp),
      platform: typeof body.platform === 'string' ? body.platform : 'unknown',
      lanIps,
    };
  } catch {
    return undefined;
  }
}

/**
 * Groups controller players by team in team-id order, unassigned players last.
 * @param players lobby roster (displays are ignored)
 */
export function groupByTeam(players: readonly LobbyPlayer[]): TeamGroup[] {
  const map = new Map<string | null, LobbyPlayer[]>();
  for (const p of players) {
    if (p.role !== 'controller') continue;
    map.set(p.teamId, [...(map.get(p.teamId) ?? []), p]);
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a.localeCompare(b);
  });
  return keys.map((teamId) => ({ teamId, players: map.get(teamId) ?? [] }));
}

/**
 * One-line settings summary for the TV.
 * @param s current match settings
 */
export function settingsSummary(s: MatchSettingsInput): string {
  const m = MatchSettings.parse(s);
  return `${m.turnTimeSeconds}s turns, ${m.snailsPerTeam} snails per team, seed ${m.seed}`;
}

const MODE_LABEL = {
  elimination: 'Elimination',
  researchRace: 'Research race',
  kingOfTheHill: 'King of the Hill',
} as const;

const cap = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * The compact settings panel of the lobby: one `[label, value]` chip per rule the host can change.
 * @param s current match settings
 */
export function settingsChips(s: MatchSettingsInput): [label: string, value: string][] {
  const m = MatchSettings.parse(s);
  const sudden =
    m.suddenDeathRound === null
      ? 'Off'
      : `Round ${m.suddenDeathRound}, ${{ water: 'rising water', drain: 'health drain', both: 'water and drain' }[m.suddenDeathType]}`;
  return [
    ['Mode', MODE_LABEL[m.mode]],
    ['Turn', `${m.turnTimeSeconds} s${m.lazyStart ? ' (lazy start)' : ''}`],
    ['Snails', `${m.snailsPerTeam} per team`],
    ['Health', String(m.startingHealth)],
    ['Wind', cap(m.wind)],
    ['Crates', cap(m.crates)],
    ['Sudden death', sudden],
    ['Fall damage', cap(m.fallDamage)],
    ['Friendly fire', m.friendlyFire ? 'On' : 'Off'],
  ];
}

/**
 * Counts ready controllers.
 * @param players lobby roster
 */
export function readyCount(players: readonly LobbyPlayer[]): { ready: number; total: number } {
  const ctl = players.filter((p) => p.role === 'controller');
  return { ready: ctl.filter((p) => p.ready).length, total: ctl.length };
}
