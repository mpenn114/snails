import {
  DEFAULT_TERRAIN_CONFIG,
  MAP_SIZE_CELLS,
  resolveMapSize,
  resolveMapStyle,
} from '@snails/core';
import type { MatchSettings, TerrainParams } from '@snails/protocol';

/**
 * Terrain parameters of a match: the default config with the grid edge of the resolved Size
 * setting (Auto picks by total snails), the resolved Map style, then any explicit overrides.
 * @param settings parsed match settings
 * @param teamCount teams in the match
 * @param overrides terrain fields that win over everything (tests, tools)
 */
export function terrainParamsFor(
  settings: MatchSettings,
  teamCount: number,
  overrides: Partial<TerrainParams> | undefined,
): TerrainParams {
  const cells =
    MAP_SIZE_CELLS[resolveMapSize(settings.mapSize, teamCount * settings.snailsPerTeam)];
  const style = resolveMapStyle(settings.mapStyle, settings.seed);
  return { ...DEFAULT_TERRAIN_CONFIG, nx: cells, nz: cells, style, ...overrides };
}
