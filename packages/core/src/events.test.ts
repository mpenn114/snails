import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './events.js';

describe('EventBus', () => {
  it('delivers, unsubscribes', () => {
    const bus = new EventBus();
    const h = vi.fn();
    bus.on('turnStarted', h);
    bus.emit('turnStarted', { teamId: 't', snailId: 's' });
    bus.off('turnStarted', h);
    bus.emit('turnStarted', { teamId: 't', snailId: 's' });
    expect(h).toHaveBeenCalledTimes(1);
  });
});
