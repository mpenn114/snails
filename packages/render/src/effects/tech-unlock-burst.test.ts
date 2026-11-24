import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@snails/core';
import { TechUnlockBurst } from './tech-unlock-burst.js';

describe('TechUnlockBurst', () => {
  it('bursts on each living snail of the completing team only', () => {
    const pos = (id: string): THREE.Vector3[] =>
      id === 'a' ? [new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 2, 3)] : [];
    const fx = new TechUnlockBurst(pos, 1, () => 0.5);
    fx.handleEvents([{ type: 'researchCompleted', teamId: 'b', techId: 'x' } as SimEvent]);
    expect(fx.live).toBe(0);
    fx.handleEvents([{ type: 'researchCompleted', teamId: 'a', techId: 'x' } as SimEvent]);
    expect(fx.live).toBe(56);
    fx.updater(5, null);
    expect(fx.live).toBe(0);
    fx.dispose();
  });
});
