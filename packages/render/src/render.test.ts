import { describe, expect, it } from 'vitest';
import { qualitySettings } from './quality.js';
import { SnailMesh } from './snail-mesh.js';

describe('render', () => {
  it('mobile tier is cheaper than high', () => {
    const m = qualitySettings('mobile', 3);
    const h = qualitySettings('high', 3);
    expect(m.pixelRatio).toBeLessThan(h.pixelRatio);
    expect(m.shadows).toBe(false);
    expect(h.shadows).toBe(true);
  });
  it('shell damage increases roughness', () => {
    const s = new SnailMesh();
    const before = s.roughness;
    s.setShellDamage(1);
    expect(s.roughness).toBeGreaterThan(before);
  });
});
