import { describe, expect, it } from 'vitest';
import { HillLayer } from './hill-layer.js';

describe('HillLayer', () => {
  it('is hidden without a zone and follows the zone when present', () => {
    const layer = new HillLayer();
    layer.sync(undefined);
    expect(layer.visible).toBe(false);
    layer.sync({ position: { x: 4, y: 2, z: 6 }, radius: 3, scores: {}, target: 30 });
    expect(layer.visible).toBe(true);
    expect(layer.group.children[0]?.position.x).toBe(4);
    expect(layer.group.children[0]?.scale.x).toBe(3);
    layer.sync({ position: { x: 9, y: 2, z: 6 }, radius: 3, scores: {}, target: 30 });
    expect(layer.group.children[0]?.position.x).toBe(9);
    layer.dispose();
  });
});
