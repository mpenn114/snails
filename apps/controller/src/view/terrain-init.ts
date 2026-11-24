import { RngStreams, generateMatchTerrain } from '@snails/core';
import type { MatchInit } from '@snails/render';
import type { MatchStarted } from './wire-types';

/**
 * Rebuilds the match's starting terrain exactly as the server did: same seed, same stream
 * derivation and the same generator parameters (and the Weapons demo flag), so no grid is sent over the wire.
 */
export function buildTerrainInit(
  seed: number,
  terrain: MatchStarted['terrain'],
  demo = false,
): MatchInit {
  const { grid } = generateMatchTerrain(terrain, new RngStreams(seed).terrain, demo);
  return { grid, waterLevel: terrain.waterLevel };
}
