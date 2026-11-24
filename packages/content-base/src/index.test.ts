import { describe, expect, it } from 'vitest';
import { ContentPackError, loadContentPacks } from '@snails/core';
import { basePack, weapons } from './index.js';

const ID_PATTERN = /^[a-z0-9]+:[a-z0-9]+(-[a-z0-9]+)*$/;

describe('basePack', () => {
  it('loads through loadContentPacks with all registries filled and frozen', () => {
    const { registries, order, contentHash } = loadContentPacks([basePack]);
    expect(order).toEqual(['base']);
    expect(contentHash).toMatch(/^[0-9a-f]{14}$/);
    expect(registries.weapons.get('base:salt-shaker')?.name).toBe('Salt Shaker');
    expect(registries.technologies.list()).toHaveLength(24);
    expect(registries.shellUpgrades.get('iron-spiral')).toBeDefined();
    expect(registries.statuses.require('base:salt').perTurnDamage).toBe(4);
    expect(registries.winds.list().map((w) => w.name)).toEqual(['Low', 'Normal', 'Off', 'Storm']);
    expect(registries.crates.size).toBeGreaterThan(0);
    expect(registries.weapons.isFrozen).toBe(true);
  });

  it('has a stable content hash', () => {
    expect(loadContentPacks([basePack]).contentHash).toBe(loadContentPacks([basePack]).contentHash);
  });

  it('defines Pebble Toss per the game design (15 core, r=1.5 m, infinite)', () => {
    const pebble = loadContentPacks([basePack]).registries.weapons.require('base:pebble-toss');
    expect(pebble.ammo).toBe('infinite');
    expect(pebble.effects).toContainEqual(
      expect.objectContaining({ type: 'damage', radius: 1.5, maxDamage: 15 }),
    );
  });

  it('uses pack-qualified weapon ids and sane launch ranges', () => {
    for (const w of weapons) {
      expect(w.id).toMatch(ID_PATTERN);
      expect(w.launch.minSpeed).toBeGreaterThan(0);
      expect(w.launch.maxSpeed).toBeGreaterThanOrEqual(w.launch.minSpeed);
    }
  });

  it('rejects loading the same pack twice', () => {
    expect(() => loadContentPacks([basePack, basePack])).toThrow(ContentPackError);
  });
});
