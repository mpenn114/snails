import type { CpuInfo, LobbyPlayer } from '@snails/protocol';
import { TEAM_COLOUR_PALETTE } from '../game/palette.js';

/** Most teams (human and CPU together) a match can hold: one per palette colour. */
export const MAX_TEAMS = TEAM_COLOUR_PALETTE.length;

/** A CPU team in a lobby: no phone, always ready. */
export interface CpuTeam extends CpuInfo {
  /** Team id (also the lobby entry id). */
  id: string;
  /** Display name, e.g. "CPU Rookie". */
  name: string;
  /** Team colour (CSS hex), unique within the room. */
  colour: string;
}

/** "CPU Rookie" style name; repeated difficulties get a numeric suffix. */
export function cpuName(info: CpuInfo, existing: readonly CpuTeam[]): string {
  const base = `CPU ${info.difficulty.charAt(0).toUpperCase()}${info.difficulty.slice(1)}`;
  const same = existing.filter((c) => c.difficulty === info.difficulty).length;
  return same === 0 ? base : `${base} ${same + 1}`;
}

/** First `cpu-N` id not used by a human team or another CPU. */
export function nextCpuId(taken: ReadonlySet<string>): string {
  let n = 1;
  while (taken.has(`cpu-${n}`)) n++;
  return `cpu-${n}`;
}

/** First palette colour nobody (phones or CPUs) has claimed. */
export function freeColour(claimed: ReadonlySet<string>, fallbackIndex: number): string {
  return (
    TEAM_COLOUR_PALETTE.find((c) => !claimed.has(c.toLowerCase())) ??
    TEAM_COLOUR_PALETTE[fallbackIndex % TEAM_COLOUR_PALETTE.length] ??
    '#888888'
  );
}

/** The lobby roster entry for a CPU team. */
export function cpuLobbyPlayer(cpu: CpuTeam): LobbyPlayer {
  return {
    id: cpu.id,
    name: cpu.name,
    role: 'controller',
    teamId: cpu.id,
    teamIds: [cpu.id],
    colour: cpu.colour,
    ready: true,
    connected: true,
    cpu: { difficulty: cpu.difficulty, personality: cpu.personality },
  };
}
