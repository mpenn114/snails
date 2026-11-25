import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VFX,
  pickWeighted,
  profiledWeapons,
  registerWeaponVfx,
  scaleCounts,
  vfx,
  vfxFor,
} from './weapon-vfx.js';

describe('weapon vfx profiles', () => {
  it('gives every base weapon its own profile', () => {
    expect(profiledWeapons().length).toBeGreaterThanOrEqual(11);
    expect(vfxFor('base:salt-shaker')).not.toBe(DEFAULT_VFX);
    expect(vfxFor('base:salt-shaker').sparkColour).not.toBe(
      vfxFor('base:slime-grenade').sparkColour,
    );
  });

  it('falls back to the default for unknown weapons', () => {
    expect(vfxFor('mod:unknown')).toBe(DEFAULT_VFX);
  });

  it('lets mods register looks and fills omitted fields from the default', () => {
    registerWeaponVfx('mod:fire', { sparks: 2, sparkColour: 0xff0000 });
    expect(vfxFor('mod:fire').sparkColour).toBe(0xff0000);
    expect(vfxFor('mod:fire').smoke).toBe(DEFAULT_VFX.smoke);
    expect(vfx({}).trail).toBe(DEFAULT_VFX.trail);
  });

  it('picks weighted colours across the range', () => {
    const cs = [
      { colour: 1, weight: 1 },
      { colour: 2, weight: 3 },
    ];
    expect(pickWeighted(cs, 0)).toBe(1);
    expect(pickWeighted(cs, 0.5)).toBe(2);
    expect(pickWeighted(cs, 5)).toBe(2);
    expect(pickWeighted([], 0.5)).toBe(0xffffff);
  });

  it('scales counts, keeping zeros and a minimum of one', () => {
    const base = { smoke: 6, debris: 10, sparks: 0 };
    expect(scaleCounts(base, DEFAULT_VFX)).toEqual(base);
    expect(scaleCounts({ smoke: 1, debris: 2, sparks: 3 }, vfx({ smoke: 0.1, sparks: 0 }))).toEqual(
      {
        smoke: 1,
        debris: 2,
        sparks: 0,
      },
    );
  });
});
