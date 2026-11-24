import { describe, expect, it } from 'vitest';
import { SplashEffects, SplashTracker } from './splash-effects.js';

const at = (id: string, y: number) => ({ id, x: 3, y, z: 4 });

describe('SplashTracker', () => {
  it('fires once when something crosses down through the surface', () => {
    const t = new SplashTracker();
    expect(t.update([at('a', 2)], 1, 1)).toEqual([]);
    expect(t.update([at('a', 0.5)], 1, 1)).toEqual([{ x: 3, z: 4, radius: 1 }]);
    expect(t.update([at('a', 0.2)], 1, 1)).toEqual([]);
  });

  it('fires when a projectile vanishes at or just above the water', () => {
    const t = new SplashTracker();
    t.update([at('p', 1.2)], 1, 1);
    expect(t.update([], 1, 1)).toHaveLength(1);
  });

  it('stays quiet for things that vanish high above the water', () => {
    const t = new SplashTracker();
    t.update([at('p', 5)], 1, 1);
    expect(t.update([], 1, 1)).toEqual([]);
  });
});

describe('SplashEffects', () => {
  it('animates a ring and droplets, then goes idle', () => {
    const fx = new SplashEffects({ level: 1, random: () => 0.5 });
    fx.spawn({ x: 1, z: 1, radius: 1 });
    expect(fx.activeRings).toBe(1);
    expect(fx.liveDroplets).toBeGreaterThan(0);
    fx.updater(2, null);
    expect(fx.activeRings).toBe(0);
    expect(fx.liveDroplets).toBe(0);
    fx.dispose();
  });
});
