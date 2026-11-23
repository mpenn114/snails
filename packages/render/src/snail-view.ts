import { Color } from 'three';
import type { GameSnapshot } from '@snails/core';

/** Everything the renderer needs to draw one snail (possibly interpolated). */
export interface SnailView {
  id: string;
  teamId: string;
  /** Team colour as a hex number (0xRRGGBB). */
  colour: number;
  position: { x: number; y: number; z: number };
  /** Facing about +Y in radians (0 = +X). */
  facing: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  name: string;
  isActive: boolean;
}

/** Fallback team palette, indexed by team order. */
export const TEAM_PALETTE: readonly number[] = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xec407a,
];

/** Deterministic palette colour for a team index (wraps). */
export function paletteColour(teamIndex: number): number {
  const n = TEAM_PALETTE.length;
  return TEAM_PALETTE[((teamIndex % n) + n) % n] as number;
}

/** Parses a CSS colour string to hex; returns the palette colour when absent or invalid. */
export function resolveTeamColour(colour: string | undefined, teamIndex: number): number {
  if (colour) {
    try {
      return new Color(colour).getHex();
    } catch {
      /* fall through to palette */
    }
  }
  return paletteColour(teamIndex);
}

/** Pure conversion of a core snapshot into snail render views. */
export function snailViewsFromSnapshot(snapshot: GameSnapshot): SnailView[] {
  const views: SnailView[] = [];
  snapshot.teams.forEach((team, index) => {
    const colour = resolveTeamColour(team.colour, index);
    for (const s of team.snails) {
      views.push({
        id: s.id,
        teamId: team.id,
        colour,
        position: { x: s.position.x, y: s.position.y, z: s.position.z },
        facing: s.facing,
        health: s.health,
        maxHealth: s.maxHealth,
        alive: s.alive,
        name: s.name,
        isActive: snapshot.turn.activeSnailId === s.id,
      });
    }
  });
  return views;
}
