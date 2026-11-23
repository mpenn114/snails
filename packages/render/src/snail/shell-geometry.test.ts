import { describe, expect, it } from 'vitest';
import {
  SHELL_HEIGHT,
  SHELL_LOD_BUDGET,
  buildShellGeometry,
  hashShellSeed,
  shellParamsFromSeed,
  type ShellLod,
} from './shell-geometry.js';

const lods: ShellLod[] = [0, 1];

describe('shell geometry', () => {
  it('derives params within the documented ranges', () => {
    for (let s = 0; s < 50; s++) {
      const p = shellParamsFromSeed(s);
      expect(p.a).toBeGreaterThanOrEqual(0.05);
      expect(p.a).toBeLessThanOrEqual(0.12);
      expect(p.b).toBeGreaterThanOrEqual(0.15);
      expect(p.b).toBeLessThanOrEqual(0.3);
      expect(p.turns).toBeGreaterThanOrEqual(3);
      expect(p.turns).toBeLessThanOrEqual(5.5);
      expect(p.ellipse).toBeGreaterThanOrEqual(0.8);
      expect(p.ellipse).toBeLessThanOrEqual(1.3);
      expect(p.ridges).toBeLessThanOrEqual(12);
    }
  });

  it('is deterministic per seed and differs between seeds', () => {
    expect(shellParamsFromSeed(7)).toEqual(shellParamsFromSeed(7));
    expect(shellParamsFromSeed(7)).not.toEqual(shellParamsFromSeed(8));
    const a = buildShellGeometry(shellParamsFromSeed(3)).getAttribute('position');
    const b = buildShellGeometry(shellParamsFromSeed(3)).getAttribute('position');
    expect(Array.from(a.array)).toEqual(Array.from(b.array));
    expect(hashShellSeed('t1', 's1')).toBe(hashShellSeed('t1', 's1'));
    expect(hashShellSeed('t1', 's1')).not.toBe(hashShellSeed('t1', 's2'));
  });

  it.each(lods)('stays within the triangle budget (lod %i)', (lod) => {
    for (let s = 0; s < 20; s++) {
      const g = buildShellGeometry(shellParamsFromSeed(s), lod);
      const tris = (g.getIndex()?.count ?? 0) / 3;
      expect(tris).toBeGreaterThan(100);
      expect(tris).toBeLessThanOrEqual(SHELL_LOD_BUDGET[lod]);
    }
  });

  it('normalises height to 1 with the aperture at the origin facing +X', () => {
    for (let s = 0; s < 20; s++) {
      const g = buildShellGeometry(shellParamsFromSeed(s));
      const box = g.boundingBox;
      expect((box?.max.y ?? 0) - (box?.min.y ?? 0)).toBeCloseTo(SHELL_HEIGHT, 4);
      const pos = g.getAttribute('position');
      const around = g.getAttribute('aAround');
      const spiral = g.getAttribute('aSpiral');
      let x = 0;
      let y = 0;
      let z = 0;
      let count = 0;
      for (let i = 0; i < pos.count; i++) {
        if (spiral.getX(i) < 1 || around.getX(i) >= 1) continue;
        x += pos.getX(i);
        y += pos.getY(i);
        z += pos.getZ(i);
        count++;
      }
      expect(count).toBeGreaterThan(0);
      expect(Math.hypot(x / count, y / count)).toBeLessThan(0.08);
      expect(Math.abs(z / count)).toBeLessThan(0.08);
      // The aperture faces +X, so the shell mass lies behind it.
      expect(box?.max.x ?? 1).toBeLessThan(0.45);
    }
  });

  it.each(lods)('exposes attribute ranges and finite data (lod %i)', (lod) => {
    const g = buildShellGeometry(shellParamsFromSeed(11), lod);
    const spiral = g.getAttribute('aSpiral');
    const around = g.getAttribute('aAround');
    expect(spiral.count).toBe(g.getAttribute('position').count);
    let maxSpiral = 0;
    for (let i = 0; i < spiral.count; i++) {
      expect(spiral.getX(i)).toBeGreaterThanOrEqual(0);
      expect(spiral.getX(i)).toBeLessThanOrEqual(1);
      expect(around.getX(i)).toBeGreaterThanOrEqual(0);
      expect(around.getX(i)).toBeLessThanOrEqual(1);
      maxSpiral = Math.max(maxSpiral, spiral.getX(i));
    }
    expect(maxSpiral).toBe(1);
    for (const v of g.getAttribute('position').array) expect(Number.isFinite(v)).toBe(true);
    for (const v of g.getAttribute('normal').array) expect(Number.isFinite(v)).toBe(true);
  });

  it('winds faces outward (normals point away from the tube centre)', () => {
    const g = buildShellGeometry(shellParamsFromSeed(5));
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const base = 30 * 9;
    let c = [0, 0, 0];
    for (let j = 0; j < 8; j++) {
      c = [
        (c[0] as number) + pos.getX(base + j) / 8,
        (c[1] as number) + pos.getY(base + j) / 8,
        (c[2] as number) + pos.getZ(base + j) / 8,
      ];
    }
    let dot = 0;
    for (let j = 0; j < 8; j++) {
      dot +=
        (pos.getX(base + j) - (c[0] as number)) * nor.getX(base + j) +
        (pos.getY(base + j) - (c[1] as number)) * nor.getY(base + j) +
        (pos.getZ(base + j) - (c[2] as number)) * nor.getZ(base + j);
    }
    expect(dot).toBeGreaterThan(0);
  });
});
