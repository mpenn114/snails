import { describe, expect, it } from 'vitest';
import type { Projectile } from '@snails/core';
import { ExplosionEffects } from './explosion-effects.js';
import { ProjectileLayer } from './projectile-layer.js';
import { PARK_Y, aliveCount, createParticleData, spawnBurst, stepParticles } from './particles.js';

const proj = (id: string, x = 0): Projectile =>
  ({
    id,
    position: { x, y: 1, z: 0 },
    velocity: { x: 0, y: 0, z: 5 },
    ownerSnailId: 's',
    weaponId: 'w',
    radius: 0.2,
    age: 0,
    fuse: 3,
  }) as unknown as Projectile;

const ex = (radius: number) => ({
  type: 'explosion' as const,
  position: { x: 1, y: 2, z: 3 },
  radius,
  weaponId: 'w',
});

const seeded = (): (() => number) => {
  let s = 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

describe('ProjectileLayer', () => {
  it('syncs meshes by id', () => {
    const layer = new ProjectileLayer({ trailLength: 4 });
    layer.sync([proj('a'), proj('b')]);
    expect(layer.size).toBe(2);
    const a = layer.get('a');
    layer.sync([proj('a', 2)]);
    expect(layer.size).toBe(1);
    expect(layer.get('a')).toBe(a);
    expect(a?.pebble.position.x).toBe(2);
    expect(layer.get('b')).toBeUndefined();
  });

  it('orients along velocity and caps the trail', () => {
    const layer = new ProjectileLayer({ trailLength: 3 });
    for (let i = 0; i < 6; i++) layer.sync([proj('a', i)]);
    const m = layer.get('a');
    expect(m?.trailCount).toBe(3);
    expect(m?.pebble.quaternion.w).toBeCloseTo(1);
  });

  it('updater reads snapshot and dispose clears', () => {
    const layer = new ProjectileLayer();
    layer.updater(0.016, { snapshot: { projectiles: [proj('a')] }, alpha: 0 } as never);
    expect(layer.size).toBe(1);
    layer.dispose();
    expect(layer.size).toBe(0);
  });
});

describe('particles', () => {
  const spec = {
    x: 0,
    y: 0,
    z: 0,
    count: 10,
    speedMin: 1,
    speedMax: 2,
    lifeMin: 1,
    lifeMax: 1,
    colour: 0xffffff,
    upBias: 0,
  };
  it('ages, dies and parks', () => {
    const d = createParticleData(16);
    spawnBurst(d, spec, seeded());
    expect(aliveCount(d)).toBe(10);
    stepParticles(d, 0.5, { gravity: 10, drag: 0 });
    expect(aliveCount(d)).toBe(10);
    stepParticles(d, 0.6, { gravity: 10, drag: 0 });
    expect(aliveCount(d)).toBe(0);
    expect(d.positions[1]).toBe(PARK_Y);
  });
  it('recycles slots when over capacity', () => {
    const d = createParticleData(8);
    spawnBurst(d, spec, seeded());
    spawnBurst(d, spec, seeded());
    expect(aliveCount(d)).toBe(8);
  });
});

describe('ExplosionEffects', () => {
  it('scales particles with radius and quality', () => {
    const small = new ExplosionEffects({ random: seeded() });
    small.handleEvents([ex(1)]);
    const big = new ExplosionEffects({ random: seeded() });
    big.handleEvents([ex(4)]);
    const low = new ExplosionEffects({ random: seeded(), quality: 0.25 });
    low.handleEvents([ex(4)]);
    expect(big.liveParticles).toBeGreaterThan(small.liveParticles);
    expect(low.liveParticles).toBeLessThan(big.liveParticles);
    expect(big.activeFlashes).toBe(1);
  });

  it('ignores other events, caps lights, and expires', () => {
    const fx = new ExplosionEffects({ maxLights: 2, random: seeded() });
    fx.handleEvents([{ type: 'tick', tick: 1 }]);
    expect(fx.activeFlashes).toBe(0);
    fx.handleEvents([ex(2), ex(2), ex(2), ex(2)]);
    expect(fx.activeFlashes).toBe(2);
    expect(fx.group.children.filter((c) => c.type === 'PointLight')).toHaveLength(2);
    fx.updater(0.3, undefined as never);
    expect(fx.activeFlashes).toBe(2);
    fx.update(0.3);
    expect(fx.activeFlashes).toBe(0);
    fx.update(2);
    expect(fx.liveParticles).toBe(0);
  });

  it('disposes', () => {
    const fx = new ExplosionEffects();
    fx.spawn(ex(2));
    fx.dispose();
    expect(fx.group.parent).toBeNull();
    expect(fx.lightCap).toBe(0);
  });
});
