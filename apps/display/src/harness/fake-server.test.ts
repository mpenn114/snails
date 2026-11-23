import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@snails/core';
import { createFakeServer } from './fake-server.js';

describe('createFakeServer', () => {
  it('inits with a grid and feeds snapshots and events with 16 snails', () => {
    let inits = 0;
    let snaps = 0;
    const events: SimEvent[] = [];
    const server = createFakeServer({
      seed: 3,
      speed: 4,
      sink: {
        onInit: (i) => {
          inits++;
          expect(i.grid.nx).toBeGreaterThan(0);
        },
        onSnapshot: () => void snaps++,
        onEvents: (e) => void events.push(...e),
      },
    });
    expect(server.sim.state.teams.flatMap((t) => t.snails)).toHaveLength(16);
    for (let i = 0; i < 600; i++) server.advance(1 / 60);
    expect(inits).toBe(1);
    expect(snaps).toBeGreaterThan(10);
    expect(server.ticks).toBeGreaterThan(1000);
    expect(events.some((e) => e.type === 'projectileFired')).toBe(true);
  });
});
