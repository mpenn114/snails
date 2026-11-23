import type { TerrainTextureSources } from '@snails/render';
import grassColor1k from '@assets/textures/grass-color-1k.jpg?url';
import grassColor512 from '@assets/textures/grass-color-512.jpg?url';
import grassNormal from '@assets/textures/grass-normal-512.jpg?url';
import dirtColor1k from '@assets/textures/dirt-color-1k.jpg?url';
import dirtColor512 from '@assets/textures/dirt-color-512.jpg?url';
import dirtNormal from '@assets/textures/dirt-normal-512.jpg?url';
import rockColor1k from '@assets/textures/rock-color-1k.jpg?url';
import rockColor512 from '@assets/textures/rock-color-512.jpg?url';
import rockNormal from '@assets/textures/rock-normal-512.jpg?url';

/** Terrain texture URLs (CC0, see packages/content-base/assets/textures/CREDITS.md). */
export const TERRAIN_TEXTURES: TerrainTextureSources = {
  full: {
    grass: { color: grassColor1k, normal: grassNormal },
    dirt: { color: dirtColor1k, normal: dirtNormal },
    rock: { color: rockColor1k, normal: rockNormal },
  },
  compact: {
    grass: { color: grassColor512 },
    dirt: { color: dirtColor512 },
    rock: { color: rockColor512 },
  },
};
