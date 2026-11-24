import { describe, expect, it } from 'vitest';
import type { AreaInstance } from '@snails/core';
import { AreaLayer } from './area-layer.js';

const area = (id: string, x: number): AreaInstance => ({
  id,
  kind: 'base:cloud',
  position: { x, y: 2, z: 3 },
  radius: 4,
  turnsLeft: 2,
  sourceSnailId: 's',
});

describe('AreaLayer', () => {
  it('creates, moves and removes domes by area id', () => {
    const layer = new AreaLayer();
    layer.sync([area('a1', 1), area('a2', 5)]);
    expect(layer.size).toBe(2);
    layer.sync([area('a1', 9)]);
    expect(layer.size).toBe(1);
    expect(layer.group.children[0]?.position.x).toBe(9);
    expect(layer.group.children[0]?.scale.x).toBeCloseTo(4, 0);
    layer.dispose();
  });

  it('gives puddles a flat water disc at the surface and goo a squashed blob', () => {
    const layer = new AreaLayer();
    layer.sync([
      { ...area('p', 2), kind: 'base:puddle', radius: 2.5, position: { x: 2, y: 6.4, z: 3 } },
      { ...area('g', 7), kind: 'base:goo-splat', radius: 2 },
    ]);
    const [puddle, goo] = layer.group.children;
    expect(puddle?.type).toBe('Group');
    expect(puddle?.position.y).toBeCloseTo(6.4, 1);
    expect(puddle?.children[0]?.scale.x).toBeCloseTo(2.5);
    expect(goo?.children).toHaveLength(2);
    expect(goo?.children[1]?.scale.y).toBeLessThan(0.3);
    layer.dispose();
  });
});
