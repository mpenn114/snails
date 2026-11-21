import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './events.js';
import { isSimEvent, type SimEvent } from './sim/events.js';

const started: SimEvent = { type: 'turnStarted', teamId: 't', snailId: 's', turnNumber: 1 };

describe('EventBus', () => {
  it('narrows the event passed to the handler', () => {
    const bus = new EventBus();
    let teamId: string | null = '';
    bus.on('turnStarted', (e) => {
      teamId = e.teamId; // only compiles if narrowed
    });
    bus.emit(started);
    expect(teamId).toBe('t');
  });

  it('calls handlers in subscription order and only for their type', () => {
    const bus = new EventBus();
    const order: string[] = [];
    bus.on('turnStarted', () => order.push('a'));
    bus.on('turnStarted', () => order.push('b'));
    const other = vi.fn();
    bus.on('tick', other);
    bus.emit(started);
    expect(order).toEqual(['a', 'b']);
    expect(other).not.toHaveBeenCalled();
  });

  it('unsubscribes via off and the returned function', () => {
    const bus = new EventBus();
    const h = vi.fn();
    const g = vi.fn();
    bus.on('turnStarted', h);
    const unsub = bus.on('turnStarted', g);
    bus.off('turnStarted', h);
    unsub();
    bus.emit(started);
    expect(h).not.toHaveBeenCalled();
    expect(g).not.toHaveBeenCalled();
  });

  it('emitAll delivers in order', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('tick', (e) => seen.push(`tick${e.tick}`));
    bus.on('turnStarted', () => seen.push('start'));
    bus.emitAll([{ type: 'tick', tick: 1 }, started, { type: 'tick', tick: 2 }]);
    expect(seen).toEqual(['tick1', 'start', 'tick2']);
  });

  it('rejects unknown event types at compile time', () => {
    const bus = new EventBus();
    // @ts-expect-error 'nope' is not a SimEvent type
    bus.emit({ type: 'nope' });
    // @ts-expect-error missing required payload fields
    bus.emit({ type: 'turnStarted' });
    expect(isSimEvent('tick')).toBe(true);
    expect(isSimEvent('nope')).toBe(false);
  });
});
