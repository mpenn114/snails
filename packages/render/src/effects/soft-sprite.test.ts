import { describe, expect, it } from 'vitest';
import {
  createSoftSpriteTexture,
  fireballOpacity,
  fireballScale,
  radialGradientData,
} from './soft-sprite.js';

describe('soft sprite', () => {
  it('is opaque at the centre and transparent at the corners', () => {
    const d = radialGradientData(9);
    expect(d[(4 * 9 + 4) * 4 + 3]).toBe(255);
    expect(d[3]).toBe(0);
    expect(d[(8 * 9 + 8) * 4 + 3]).toBe(0);
  });
  it('creates a DataTexture of the requested size', () => {
    const t = createSoftSpriteTexture(8);
    expect(t.image.width).toBe(8);
    t.dispose();
  });
  it('fireball grows but stays under the radius and fades out', () => {
    expect(fireballScale(0)).toBeCloseTo(0.35);
    expect(fireballScale(1)).toBeCloseTo(0.85);
    expect(fireballScale(2)).toBeLessThanOrEqual(0.85 + 1e-9);
    expect(fireballOpacity(0)).toBeCloseTo(0.55);
    expect(fireballOpacity(1)).toBe(0);
  });
});
