import { describe, expect, it } from 'vitest';
import { emitChunk } from './chunk-pool.js';
import { SoftPuffs } from './soft-puffs.js';
import { smokeAlpha, wispAlpha, wispScale } from './blast-params.js';

const spec = {
  x: 1,
  y: 2,
  z: 3,
  vx: 0,
  vy: 0,
  vz: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  sx: 0,
  sy: 0,
  sz: 0,
  size: 0.5,
  colour: 0xffffff,
  life: 1,
  floorY: 0,
};

describe('SoftPuffs', () => {
  it('draws live puffs in one instanced mesh and collapses dead ones', () => {
    const p = new SoftPuffs(4, { gravity: 0, drag: 0, restitution: 0 }, { scale: () => 1 });
    emitChunk(p.pool, spec);
    p.advance(0.1);
    expect(p.live).toBe(1);
    const geo = p.mesh.geometry as unknown as { instanceCount: number };
    expect(geo.instanceCount).toBe(4);
    p.advance(2);
    expect(p.live).toBe(0);
    p.dispose();
    expect(p.mesh.parent).toBeNull();
  });
});

describe('soft curves', () => {
  it('wisps and smoke fade in softly and end fully transparent', () => {
    for (const f of [wispAlpha, smokeAlpha]) {
      expect(f(0.1)).toBeGreaterThan(0.1);
      expect(f(0.1)).toBeLessThan(0.7);
      expect(f(1)).toBeCloseTo(0);
    }
    expect(wispScale(1)).toBeGreaterThan(wispScale(0));
  });
});
