import type { SdfGrid } from '@snails/core';

/** Test hook exposed on `window.__snailsTerrain` so e2e can compare terrain across displays. */
export interface TerrainProbe {
  /** Number of terrain events (carve and collapse) the replica applied. */
  applied(): number;
  /** FNV-1a checksum (hex) of the replica's SDF samples. */
  checksum(): string;
}

/** FNV-1a (hex) over the raw bytes of the grid's SDF samples. */
export function gridChecksum(grid: SdfGrid): string {
  const bytes = new Uint8Array(grid.data.buffer, grid.data.byteOffset, grid.data.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ (bytes[i] as number), 0x01000193) >>> 0;
  return h.toString(16);
}

/** Builds a probe over a replica accessor (null before the match renderer is initialised). */
export function createTerrainProbe(
  replica: () => { grid: SdfGrid; applied: number } | null,
): TerrainProbe {
  return {
    applied: () => replica()?.applied ?? 0,
    checksum: () => {
      const r = replica();
      return r ? gridChecksum(r.grid) : '';
    },
  };
}
