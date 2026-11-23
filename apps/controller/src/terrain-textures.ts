import type { TerrainTextureSources } from '@snails/render';
import grassColor512 from '@assets/textures/grass-color-512.jpg?url';
import dirtColor512 from '@assets/textures/dirt-color-512.jpg?url';
import rockColor512 from '@assets/textures/rock-color-512.jpg?url';

/**
 * Terrain texture URLs for phones (CC0, see packages/content-base/assets/textures/CREDITS.md):
 * 512 px colour maps only, no normal maps (the `full` set is never picked on the mobile tier).
 */
export const TERRAIN_TEXTURES: TerrainTextureSources = {
  full: {
    grass: { color: grassColor512 },
    dirt: { color: dirtColor512 },
    rock: { color: rockColor512 },
  },
  compact: {
    grass: { color: grassColor512 },
    dirt: { color: dirtColor512 },
    rock: { color: rockColor512 },
  },
};
