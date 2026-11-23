import { ClampToEdgeWrapping, DataTexture, DataUtils, HalfFloatType } from 'three';
import { LinearFilter, RedFormat } from 'three';
import type { SdfGrid } from '@snails/core';
import { surfaceHeight } from '../props/prop-plan.js';

/** Height stored for columns that were all air (never counts as carved ground). */
export const NO_SURFACE_HEIGHT = -100;

/** Top surface height of every grid column, row-major (x fastest), sampled at the grid nodes. */
export interface OriginalHeightMap {
  width: number;
  depth: number;
  /** Metres. */
  heights: Float32Array;
}

/** Scans the grid once: the highest solid surface of each (x, z) column. View-only. */
export function buildOriginalHeightMap(grid: SdfGrid): OriginalHeightMap {
  const width = grid.nx;
  const depth = grid.nz;
  const heights = new Float32Array(width * depth);
  const max = grid.worldSize();
  for (let k = 0; k < depth; k++) {
    for (let i = 0; i < width; i++) {
      const x = Math.min(i * grid.cellSize, max.x - 1e-4);
      const z = Math.min(k * grid.cellSize, max.z - 1e-4);
      heights[k * width + i] = surfaceHeight(grid, x, z) ?? NO_SURFACE_HEIGHT;
    }
  }
  return { width, depth, heights };
}

/**
 * Half-float single-channel texture of the original surface heights (bilinear filtered), for the
 * terrain shader to tell carved ground (craters, tunnels) from the untouched top surface.
 */
export function createOriginalHeightTexture(map: OriginalHeightMap): DataTexture {
  const data = new Uint16Array(map.heights.length);
  for (let i = 0; i < data.length; i++) data[i] = DataUtils.toHalfFloat(map.heights[i] as number);
  const tex = new DataTexture(data, map.width, map.depth, RedFormat, HalfFloatType);
  tex.minFilter = tex.magFilter = LinearFilter;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
