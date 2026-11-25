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
      expect(p.a).toBeLessThanOrEqual(0.1);
      expect(p.b).toBeGreaterThanOrEqual(0.2);
      expect(p.b).toBeLessThanOrEqual(0.27);
      expect(p.turns).toBeGreaterThanOrEqual(2.8);
      expect(p.turns).toBeLessThanOrEqual(3.5);
      expect(p.ellipse).toBeGreaterThanOrEqual(1.0);
      expect(p.ellipse).toBeLessThanOrEqual(1.2);
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
      expect(box?.max.x ?? 1).toBeLessThan(0.5);
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
    const base = 30 * 13;
    let c = [0, 0, 0];
    for (let j = 0; j < 12; j++) {
      c = [
        (c[0] as number) + pos.getX(base + j) / 12,
        (c[1] as number) + pos.getY(base + j) / 12,
        (c[2] as number) + pos.getZ(base + j) / 12,
      ];
    }
    let dot = 0;
    for (let j = 0; j < 12; j++) {
      dot +=
        (pos.getX(base + j) - (c[0] as number)) * nor.getX(base + j) +
        (pos.getY(base + j) - (c[1] as number)) * nor.getY(base + j) +
        (pos.getZ(base + j) - (c[2] as number)) * nor.getZ(base + j);
    }
    expect(dot).toBeGreaterThan(0);
  });

  it('is a conical spiral with a hollow mouth, a lip and a decal seat', () => {
    const g = buildShellGeometry(shellParamsFromSeed(3));
    const spiral = g.getAttribute('aSpiral');
    let lip = 0;
    let mouth = 0;
    for (let i = 0; i < spiral.count; i++) {
      if (spiral.getX(i) > 0.97 && spiral.getX(i) < 0.999) lip++;
      if (spiral.getX(i) >= 0.999) mouth++;
    }
    expect(lip).toBeGreaterThan(10);
    expect(mouth).toBeGreaterThan(10);
    const box = g.boundingBox;
    // Both faces bulge: the coil axis extent is a good part of the height (not a flat disc).
    expect((box?.max.z ?? 0) - (box?.min.z ?? 0)).toBeGreaterThan(0.35);
    const decal = g.userData.decal as { position: number[]; normal: number[] };
    expect(Math.hypot(...decal.normal)).toBeCloseTo(1, 3);
    for (const v of decal.position) expect(Number.isFinite(v)).toBe(true);
  });

  it('has smooth seam normals (duplicate seam vertices share a normal)', () => {
    const g = buildShellGeometry(shellParamsFromSeed(9));
    const nor = g.getAttribute('normal');
    const cols = 13;
    for (const k of [5, 20, 40]) {
      const a = k * cols;
      const b = a + 12;
      expect(nor.getX(a)).toBeCloseTo(nor.getX(b), 5);
      expect(nor.getY(a)).toBeCloseTo(nor.getY(b), 5);
    }
  });
});
