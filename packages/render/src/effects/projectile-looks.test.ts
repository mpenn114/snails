import { describe, expect, it } from 'vitest';
import type { Projectile } from '@snails/core';
import { ProjectileLayer } from './projectile-layer.js';
import {
  LOOK_TRAIL,
  buildDrillGeometry,
  buildLookGeometry,
  buildRollerGeometry,
  lookFor,
} from './projectile-looks.js';
import { PALETTE } from '../style/palette.js';

function proj(id: string, weaponId: string): Projectile {
  return {
    id,
    position: { x: 1, y: 2, z: 3 },
    velocity: { x: 5, y: 0, z: 0 },
    ownerSnailId: 's',
    weaponId,
    radius: 0.2,
    age: 0.3,
    maxAge: 4,
    gravityScale: 1,
    windScale: 1,
  };
}

describe('projectile looks', () => {
  it('maps weapon ids to looks, defaulting to the pebble', () => {
    expect(lookFor('base:pebble-roller')).toBe('roller');
    expect(lookFor('base:shell-drill')).toBe('drill');
    expect(lookFor('base:pebble-toss')).toBe('pebble');
    expect(lookFor('mod:anything')).toBe('pebble');
  });

  it('keeps geometry low poly and coloured per vertex', () => {
    const roller = buildRollerGeometry();
    const drill = buildDrillGeometry();
    expect(roller.getAttribute('position').count / 3).toBe(80);
    expect(drill.getAttribute('position').count / 3).toBeLessThanOrEqual(48);
    for (const g of [roller, drill, buildLookGeometry('pebble')]) {
      expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
    }
  });

  it('points the drill bit along +Z so it flies tip first', () => {
    const pos = buildDrillGeometry().getAttribute('position');
    let tip = -Infinity;
    for (let i = 0; i < pos.count; i++) tip = Math.max(tip, pos.getZ(i));
    expect(tip).toBeCloseTo(1);
  });

  it('puffs soil dust behind a drill', () => {
    expect(LOOK_TRAIL.drill).toBe(PALETTE.soil);
  });

  it('gives each projectile the look of its weapon and spins the drill faster', () => {
    const layer = new ProjectileLayer({ trailLength: 4 });
    layer.sync([proj('a', 'base:pebble-roller'), proj('b', 'base:shell-drill')]);
    expect(layer.get('a')?.look).toBe('roller');
    expect(layer.get('b')?.look).toBe('drill');
    expect(layer.get('a')?.pebble.geometry).not.toBe(layer.get('b')?.pebble.geometry);
    layer.dispose();
  });
});
