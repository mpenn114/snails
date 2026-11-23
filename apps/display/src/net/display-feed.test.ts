import { describe, expect, it, vi } from 'vitest';
import { encodeEventBatch, encodeSnapshot } from '@snails/protocol';
import { routeServerMessage, type DisplayFeed } from './display-feed';

const feed = (): DisplayFeed => ({
  onInit: vi.fn(),
  onSnapshot: vi.fn(),
  onCompactSnapshot: vi.fn(),
  onEvents: vi.fn(),
});

describe('routeServerMessage', () => {
  it('routes snapshots and event batches, ignores others', () => {
    const f = feed();
    routeServerMessage(
      f,
      encodeSnapshot({
        tick: 1,
        wind: { strength: 0, direction: 0 },
        turn: {
          activeTeamId: null,
          activeSnailId: null,
          phase: 'intro',
          timeRemaining: 0,
          turnNumber: 0,
        },
        snails: [],
        projectiles: [],
      }),
    );
    expect(f.onCompactSnapshot).toHaveBeenCalledTimes(1);
    const ev = { type: 'windChanged', strength: 1, direction: 2 } as const;
    routeServerMessage(f, encodeEventBatch(2, [ev]));
    expect(f.onEvents).toHaveBeenCalledWith([ev]);
    routeServerMessage(f, { type: 'error', code: 'internal', message: 'y' });
    expect(f.onCompactSnapshot).toHaveBeenCalledTimes(1);
    expect(f.onEvents).toHaveBeenCalledTimes(1);
  });
});
