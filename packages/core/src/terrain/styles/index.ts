import { archipelagoStyle } from './archipelago.js';
import { canyonStyle } from './canyon.js';
import { cavernsStyle } from './caverns.js';
import { highlandsStyle } from './highlands.js';
import { islandStyle } from './island.js';
import type { TerrainStyle, TerrainStyleImpl } from './types.js';

export * from './types.js';

/** Every terrain style by name. */
export const TERRAIN_STYLE_IMPLS: Readonly<Record<TerrainStyle, TerrainStyleImpl>> = {
  island: islandStyle,
  archipelago: archipelagoStyle,
  highlands: highlandsStyle,
  caverns: cavernsStyle,
  canyon: canyonStyle,
};
