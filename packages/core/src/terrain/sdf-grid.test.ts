import { describe, expect, it } from 'vitest';
import { SdfGrid } from './sdf-grid.js';

describe('SdfGrid', () => {
  it('carveSphere turns solid into air', () => {
    const g = new SdfGrid(16, 16, 16, 1, -1);
    const c = { x: 8, y: 8, z: 8 };
    expect(g.sample(c)).toBeLessThan(0);
    g.carveSphere(c, 3);
    expect(g.sample(c)).toBeGreaterThan(0);
    expect(g.sample({ x: 1, y: 1, z: 1 })).toBeLessThan(0);
  });
});
