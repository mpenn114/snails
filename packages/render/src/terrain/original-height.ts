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
 * Like {@link buildOriginalHeightMap}, but for the water: where the column's top is dry land
 * yet the ground at the waterline is open (a tunnel or cave mouth under a roof), the height is the
 * floor of that opening, so flooded passages read as water instead of as land with foam.
 */
export function buildWaterHeightMap(grid: SdfGrid, level: number): OriginalHeightMap {
  const map = buildOriginalHeightMap(grid);
  const max = grid.worldSize();
  const probe = level + 0.6;
  const step = grid.cellSize * 0.5;
  for (let k = 0; k < map.depth; k++) {
    for (let i = 0; i < map.width; i++) {
      const idx = k * map.width + i;
      if ((map.heights[idx] as number) <= probe) continue;
      const x = Math.min(i * grid.cellSize, max.x - 1e-4);
      const z = Math.min(k * grid.cellSize, max.z - 1e-4);
      let prev = grid.sampleLinear({ x, y: probe, z });
      if (prev < 0) continue;
      for (let y = probe - step; y >= 0; y -= step) {
        const v = grid.sampleLinear({ x, y, z });
        if (v < 0) {
          map.heights[idx] = y + (step * v) / (v - prev);
          break;
        }
        prev = v;
      }
    }
  }
  return map;
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

/** Value of `snowStart` that disables snow caps. */
export const NO_SNOW = 1000;

/**
 * World height (m) above which snow caps may form, from a column height map: only narrow, real
 * peaks qualify (max at least 16 m and under 3% of the land within 2.5 m of it). Broad mesas and
 * low or gently rolling maps get {@link NO_SNOW}; otherwise snow starts 3.2 m below the summit.
 */
export function snowStartFor(heights: Float32Array): number {
  let max = -Infinity;
  let land = 0;
  for (const h of heights) {
    if (h <= NO_SURFACE_HEIGHT + 1) continue;
    land++;
    if (h > max) max = h;
  }
  if (land === 0 || max < 16) return NO_SNOW;
  let top = 0;
  for (const h of heights) if (h > max - 2.5) top++;
  return top / land < 0.03 ? max - 3.2 : NO_SNOW;
}
