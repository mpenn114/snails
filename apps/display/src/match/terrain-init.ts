import { RngStreams, generateTerrain } from '@snails/core';
import type { MatchInit } from '@snails/render';
import type { MatchStarted } from './match-adapter';

/**
 * Rebuilds the match's starting terrain exactly as the server did (same seed, stream and
 * generator parameters), so no grid is sent over the wire.
 */
export function buildTerrainInit(m: MatchStarted): MatchInit {
  const { grid } = generateTerrain(m.terrain, new RngStreams(m.seed).terrain);
  return { grid, waterLevel: m.terrain.waterLevel };
}
