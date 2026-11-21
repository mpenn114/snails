import { describe, expect, it } from 'vitest';
import { carveSphere } from '../terrain/carve.js';
import type { SdfGrid } from '../terrain/sdf-grid.js';
import type { Vec3 } from '../state/types.js';
import {
  caseLabel,
  caseRng,
  cloneGrid,
  firstDifference,
  PROPERTY_CASES,
  randomGrid,
  sameBytes,
} from './property-helpers.js';
import type { Rng } from '../rng.js';

const BASE_SEED = 0xc0ffee;

/** Random sphere centre (may lie slightly outside the grid) and radius in metres. */
function randomSphere(rng: Rng, grid: SdfGrid): { centre: Vec3; radius: number } {
  const w = grid.worldSize();
  const pad = grid.cellSize * 2;
  const centre = {
    x: rng.range(-pad, w.x + pad),
    y: rng.range(-pad, w.y + pad),
    z: rng.range(-pad, w.z + pad),
  };
  const maxR = Math.max(w.x, w.y, w.z) / 2;
  return { centre, radius: rng.range(0.2, Math.max(0.5, maxR)) };
}

/** Human-readable description of a sphere for failure messages. */
function describeSphere(s: { centre: Vec3; radius: number }): string {
  const { x, y, z } = s.centre;
  return `centre=(${x},${y},${z}) radius=${s.radius}`;
}

/** Cell coordinates of every cell whose value changed between two data snapshots. */
function changedCells(before: Float32Array, grid: SdfGrid): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let z = 0; z < grid.nz; z++) {
    for (let y = 0; y < grid.ny; y++) {
      for (let x = 0; x < grid.nx; x++) {
        const i = grid.index(x, y, z);
        if (!Object.is(before[i], grid.data[i])) out.push({ x, y, z });
      }
    }
  }
  return out;
}

describe('carveSphere properties', () => {
  it('is monotonic: no cell value decreases (solid is never added)', () => {
    for (let c = 0; c < PROPERTY_CASES; c++) {
      const rng = caseRng(BASE_SEED, c);
      const grid = randomGrid(rng);
      const before = grid.data.slice();
      const s = randomSphere(rng, grid);
      carveSphere(grid, s.centre, s.radius);
      let bad = -1;
      for (let i = 0; i < before.length && bad < 0; i++) {
        if ((grid.data[i] ?? 0) < (before[i] ?? 0)) bad = i;
      }
      const at = bad < 0 ? '' : `cell index ${bad}: ${before[bad]} -> ${grid.data[bad]}`;
      expect(bad, `${caseLabel('monotonic', BASE_SEED, c)} ${describeSphere(s)} ${at}`).toBe(-1);
    }
  });

  it('is idempotent: a second identical carve changes nothing and reports 0 cells', () => {
    for (let c = 0; c < PROPERTY_CASES; c++) {
      const rng = caseRng(BASE_SEED + 1, c);
      const grid = randomGrid(rng);
      const s = randomSphere(rng, grid);
      carveSphere(grid, s.centre, s.radius);
      const once = grid.data.slice();
      const second = carveSphere(grid, s.centre, s.radius);
      const label = `${caseLabel('idempotent', BASE_SEED + 1, c)} ${describeSphere(s)}`;
      expect(second.cellsChanged, label).toBe(0);
      expect(second.chunks, label).toEqual([]);
      expect(
        sameBytes(once, grid.data),
        `${label} data differs at ${firstDifference(once, grid.data)}`,
      ).toBe(true);
    }
  });

  it('is order independent: A then B equals B then A byte for byte', () => {
    for (let c = 0; c < PROPERTY_CASES; c++) {
      const rng = caseRng(BASE_SEED + 2, c);
      const base = randomGrid(rng);
      const a = randomSphere(rng, base);
      const b = randomSphere(rng, base);
      const ab = cloneGrid(base);
      const ba = cloneGrid(base);
      carveSphere(ab, a.centre, a.radius);
      carveSphere(ab, b.centre, b.radius);
      carveSphere(ba, b.centre, b.radius);
      carveSphere(ba, a.centre, a.radius);
      const label = `${caseLabel('order', BASE_SEED + 2, c)} A(${describeSphere(a)}) B(${describeSphere(b)})`;
      expect(
        sameBytes(ab.data, ba.data),
        `${label} first difference at ${firstDifference(ab.data, ba.data)}`,
      ).toBe(true);
    }
  });

  it('reports dirty chunks covering every changed cell', () => {
    for (let c = 0; c < PROPERTY_CASES; c++) {
      const rng = caseRng(BASE_SEED + 3, c);
      const grid = randomGrid(rng);
      const s = randomSphere(rng, grid);
      const before = grid.data.slice();
      grid.takeDirtyChunks();
      const result = carveSphere(grid, s.centre, s.radius);
      const dirty = new Set(grid.takeDirtyChunks());
      const reported = new Set(result.chunks);
      const label = `${caseLabel('dirty-chunks', BASE_SEED + 3, c)} ${describeSphere(s)}`;
      const missing = changedCells(before, grid).find((cell) => {
        const id = grid.chunkOf(cell.x, cell.y, cell.z);
        return !reported.has(id) || !dirty.has(id);
      });
      const detail = missing ? `cell ${JSON.stringify(missing)} chunk not reported or dirty` : '';
      expect(detail, label).toBe('');
    }
  });

  it('leaves every cell strictly inside the sphere as air', () => {
    for (let c = 0; c < PROPERTY_CASES; c++) {
      const rng = caseRng(BASE_SEED + 4, c);
      const grid = randomGrid(rng);
      const s = randomSphere(rng, grid);
      carveSphere(grid, s.centre, s.radius);
      const cs = grid.cellSize;
      const label = `${caseLabel('interior-air', BASE_SEED + 4, c)} ${describeSphere(s)}`;
      let bad = '';
      for (let z = 0; z < grid.nz && !bad; z++) {
        for (let y = 0; y < grid.ny && !bad; y++) {
          for (let x = 0; x < grid.nx && !bad; x++) {
            const d = Math.hypot(x * cs - s.centre.x, y * cs - s.centre.y, z * cs - s.centre.z);
            if (d < s.radius - cs && grid.get(x, y, z) < 0) {
              bad = `cell (${x},${y},${z}) d=${d} value=${grid.get(x, y, z)} not air`;
            }
          }
        }
      }
      expect(bad, label).toBe('');
    }
  });
});
