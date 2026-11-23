import type { LobbyPlayer, MatchSettings } from '@snails/protocol';

/** Subset of `GET /api/info` the display needs. */
export interface InfoLike {
  joinUrl: string;
  primaryIp: string;
  port: number;
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
    return { joinUrl: body.joinUrl, primaryIp: body.primaryIp, port: Number(body.port) };
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
export function settingsSummary(s: MatchSettings): string {
  return `${s.turnTimeSeconds}s turns, ${s.snailsPerTeam} snails per team, seed ${s.seed}`;
}

/**
 * Counts ready controllers.
 * @param players lobby roster
 */
export function readyCount(players: readonly LobbyPlayer[]): { ready: number; total: number } {
  const ctl = players.filter((p) => p.role === 'controller');
  return { ready: ctl.filter((p) => p.ready).length, total: ctl.length };
}
