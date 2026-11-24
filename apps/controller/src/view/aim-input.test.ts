import { describe, expect, it } from 'vitest';
import { predictTrajectory } from '@snails/core';
import { weapons } from '@snails/content-base';
import { DEFAULT_LOCAL_AIM, aimHintInput, resolveAim } from './aim-input';

describe('resolveAim', () => {
  it('prefers the local drag, then the snapshot, then the default', () => {
    const a = { angle: 0.1, power: 0.2 };
    const b = { angle: 0.3, power: 0.4 };
    expect(resolveAim(a, b)).toBe(a);
    expect(resolveAim(null, b)).toBe(b);
    expect(resolveAim(null, undefined)).toBe(DEFAULT_LOCAL_AIM);
  });
});

describe('aimHintInput', () => {
  it('is null for unknown weapons', () => {
    expect(aimHintInput('s', undefined, { angle: 0, power: 1 })).toBeNull();
  });

  it('carries launch, aim and the weapon-specific motion/melee data', () => {
    const aim = { angle: 0.5, power: 0.8 };
    for (const w of weapons) {
      const input = aimHintInput('s1', w, aim);
      if (w.category === 'utility') {
        expect(input).toBeNull();
        continue;
      }
      expect(input?.launch).toBe(w.launch);
      expect(input?.angle).toBe(0.5);
      expect(input?.power).toBe(0.8);
      expect(input?.motion?.kind).toBe(w.motion?.kind);
      expect(input?.melee?.reach).toBe(w.melee?.reach);
    }
  });

  it('feeds predictTrajectory so a drill previews shorter than a plain shot', () => {
    const drill = weapons.find((w) => w.motion?.kind === 'drill');
    const plain = weapons.find((w) => !w.motion && !w.melee && w.category !== 'utility');
    if (!drill || !plain) throw new Error('base weapons missing');
    const wind = { strength: 0, direction: 0 };
    const reach = (w: typeof drill): number => {
      const i = aimHintInput('s', w, { angle: 0.3, power: 1 });
      if (!i?.launch) throw new Error('no input');
      const pts = predictTrajectory({ x: 0, y: 0, z: 0 }, 0, i, i.launch, wind, 40, 5, w.motion);
      return pts[pts.length - 1]?.x ?? 0;
    };
    expect(reach(drill)).toBeLessThan(reach(plain));
  });
});
