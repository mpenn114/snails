import { describe, expect, it } from 'vitest';
import { ContentError, createContentRegistries } from '@snails/core';
import { registerBaseContent, weapons } from './index.js';

const ID_PATTERN = /^[a-z0-9]+:[a-z0-9]+(-[a-z0-9]+)*$/;

describe('registerBaseContent', () => {
  it('registers weapons, techs and shell upgrades', () => {
    const r = createContentRegistries();
    registerBaseContent(r);
    expect(r.weapons.get('base:salt-bomb')?.name).toBe('Salt Bomb');
    expect(r.weapons.require('base:pebble-toss').explosion.maxDamage).toBe(35);
    expect(r.weapons.require('base:pebble-toss').explosion.radius).toBe(2);
    expect(r.technologies.list()).toHaveLength(3);
    expect(r.shellUpgrades.get('iron-spiral')).toBeDefined();
  });

  it('uses pack-qualified weapon ids and sane launch ranges', () => {
    for (const w of weapons) {
      expect(w.id).toMatch(ID_PATTERN);
      expect(w.launch.minSpeed).toBeGreaterThan(0);
      expect(w.launch.maxSpeed).toBeGreaterThanOrEqual(w.launch.minSpeed);
    }
  });

  it('rejects a second registration with DUPLICATE_ID', () => {
    const r = createContentRegistries();
    registerBaseContent(r);
    try {
      registerBaseContent(r);
      expect.unreachable('expected duplicate registration to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ContentError);
      expect((err as ContentError).code).toBe('DUPLICATE_ID');
    }
  });

  it('locks content once frozen', () => {
    const r = createContentRegistries();
    registerBaseContent(r);
    r.weapons.freeze();
    expect(() => r.weapons.register({ ...weapons[0]!, id: 'base:late' })).toThrow(ContentError);
  });
});
