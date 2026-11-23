import { RngStreams, generateTerrain } from '@snails/core';
import type { MatchInit } from '@snails/render';
import type { MatchStarted } from './wire-types';

/**
 * Rebuilds the match's starting terrain exactly as the server did: same seed, same stream
 * derivation and the same generator parameters, so no grid is sent over the wire.
 */
export function buildTerrainInit(seed: number, terrain: MatchStarted['terrain']): MatchInit {
  const { grid } = generateTerrain(terrain, new RngStreams(seed).terrain);
  return { grid, waterLevel: terrain.waterLevel };
}
