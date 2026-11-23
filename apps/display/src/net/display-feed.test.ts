import { describe, expect, it, vi } from 'vitest';
import { routeServerMessage, type DisplayFeed } from './display-feed';

const feed = (): DisplayFeed => ({ onInit: vi.fn(), onSnapshot: vi.fn(), onEvents: vi.fn() });

describe('routeServerMessage', () => {
  it('routes snapshots and events, ignores others', () => {
    const f = feed();
    routeServerMessage(f, { type: 'stateSnapshot', tick: 1, state: { tick: 1 } });
    expect(f.onSnapshot).toHaveBeenCalledWith({ tick: 1 });
    routeServerMessage(f, { type: 'gameEvent', event: 'explosion', payload: { radius: 2 } });
    expect(f.onEvents).toHaveBeenCalledWith([{ type: 'explosion', radius: 2 }]);
    routeServerMessage(f, { type: 'error', code: 'x', message: 'y' });
    expect(f.onSnapshot).toHaveBeenCalledTimes(1);
    expect(f.onEvents).toHaveBeenCalledTimes(1);
  });
});
