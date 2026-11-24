import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ShellExtras, attachmentSpots } from './shell-extras.js';

describe('ShellExtras', () => {
  it('places evenly spaced spots on the ring', () => {
    const spots = attachmentSpots(4, 2);
    expect(spots).toHaveLength(4);
    for (const s of spots) expect(Math.hypot(s.position[0], s.position[1])).toBeCloseTo(2);
  });
  it('builds attachments, ignores unknown ones, and drives glow and shimmer', () => {
    const x = new ShellExtras(new THREE.SphereGeometry(0.5, 6, 4));
    x.setLook({ material: null, attachments: ['spikes', 'plates', 'wings'], glow: null });
    expect(x.pieceCount).toBe(10);
    expect(x.glowVisible).toBe(false);
    x.setShimmer(true);
    expect(x.glowVisible).toBe(true);
    x.setShimmer(false);
    x.setLook({ material: null, attachments: [], glow: 0xff0000 });
    expect(x.pieceCount).toBe(0);
    expect(x.glowVisible).toBe(true);
    x.dispose();
  });
});
