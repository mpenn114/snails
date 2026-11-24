import { describe, expect, it } from 'vitest';
import type { ScheduledEffect } from '@snails/core';
import { ScheduledLayer } from './scheduled-layer.js';

const entry = (id: string, groupId: string, x: number, style: 'strike' | 'arrival' = 'strike') =>
  ({
    id,
    groupId,
    weaponId: 'w',
    ownerSnailId: 's',
    position: { x, y: 5, z: 3 },
    turnsLeft: 2,
    effects: [],
    telegraph: { radius: 2, style },
  }) satisfies ScheduledEffect;

describe('ScheduledLayer', () => {
  it('shows one marker per entry and a line across a multi-entry group', () => {
    const layer = new ScheduledLayer();
    layer.sync([entry('s1', 'g1', 2), entry('s2', 'g1', 6), entry('s3', 'g2', 20, 'arrival')]);
    expect(layer.size).toBe(3);
    // 3 marker groups + 1 line for g1 (g2 has a single member).
    expect(layer.group.children).toHaveLength(4);
    const line = layer.group.children[3];
    expect(line?.position.x).toBeCloseTo(4);
    expect(line?.scale.x).toBeCloseTo(4);
    layer.dispose();
  });

  it('removes markers and lines when the entries are gone', () => {
    const layer = new ScheduledLayer();
    layer.sync([entry('s1', 'g1', 2), entry('s2', 'g1', 6)]);
    layer.sync([]);
    expect(layer.size).toBe(0);
    expect(layer.group.children).toHaveLength(0);
    layer.dispose();
  });

  it('only the arrival style shows the landing disc', () => {
    const layer = new ScheduledLayer();
    layer.sync([entry('s1', 'g1', 2, 'arrival'), entry('s2', 'g2', 8)]);
    const [arrival, strike] = layer.group.children;
    expect(arrival?.children[0]?.visible).toBe(true);
    expect(strike?.children[0]?.visible).toBe(false);
    layer.dispose();
  });
});
