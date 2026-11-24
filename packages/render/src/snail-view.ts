import { TEAM_COLORS } from './style/palette.js';
import { Color } from 'three';
import type { GameSnapshot } from '@snails/core';

/** Everything the renderer needs to draw one snail (possibly interpolated). */
export interface SnailView {
  id: string;
  teamId: string;
  /** Team slot (index in the snapshot's team list); selects the shell pattern. */
  teamIndex: number;
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
  /** Resting on the ground (absent = grounded). Drives the jump pose. */
  grounded?: boolean;
  /** Active snail in the aim part of its turn (animation lean). */
  aiming?: boolean;
  /** Aim elevation in radians above the facing direction (absent = 0). */
  aimAngle?: number;
  /** Active snail retreating after its shot (animation). */
  retreating?: boolean;
}

/** Fallback team palette, indexed by team order. */
export const TEAM_PALETTE: readonly number[] = TEAM_COLORS;

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
      const active = snapshot.turn.activeSnailId === s.id;
      const phase = snapshot.turn.phase;
      views.push({
        id: s.id,
        teamId: team.id,
        teamIndex: index,
        colour,
        position: { x: s.position.x, y: s.position.y, z: s.position.z },
        facing: s.facing,
        health: s.health,
        maxHealth: s.maxHealth,
        alive: s.alive,
        name: s.name,
        isActive: active,
        grounded: s.grounded !== false,
        aiming: active && s.alive && phase === 'action' && !snapshot.turn.fired,
        aimAngle: s.aim?.angle ?? 0,
        retreating: active && s.alive && phase === 'retreat',
      });
    }
  });
  return views;
}
