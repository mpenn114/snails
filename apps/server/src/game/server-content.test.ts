import { describe, expect, it } from 'vitest';
import { loadServerContent } from './server-content.js';

describe('loadServerContent', () => {
  it('loads the base pack once through the pack loader, frozen', () => {
    const a = loadServerContent();
    expect(a.order).toEqual(['base']);
    expect(a.registries.weapons.has('base:pebble-toss')).toBe(true);
    expect(a.registries.statuses.has('base:salt')).toBe(true);
    expect(a.registries.weapons.isFrozen).toBe(true);
    expect(loadServerContent()).toBe(a);
  });
});
