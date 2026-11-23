import { describe, expect, it, vi } from 'vitest';
import { bindPageLifecycle } from './lifecycle';

function target(): {
  fire(type: string, e?: object): void;
  addEventListener(t: string, f: EventListener): void;
  removeEventListener(t: string, f: EventListener): void;
  count(): number;
  hidden: boolean;
} {
  const m = new Map<string, EventListener>();
  return {
    hidden: false,
    fire: (t, e = {}) => m.get(t)?.(e as Event),
    addEventListener: (t, f) => void m.set(t, f),
    removeEventListener: (t) => void m.delete(t),
    count: () => m.size,
  };
}

describe('bindPageLifecycle', () => {
  it('resumes on bfcache restore and on becoming visible, ignores hidden', () => {
    const client = { resume: vi.fn(), close: vi.fn() };
    const win = target();
    const doc = target();
    bindPageLifecycle(client, win, doc);
    win.fire('pageshow', { persisted: false });
    expect(client.resume).not.toHaveBeenCalled();
    win.fire('pageshow', { persisted: true });
    expect(client.resume).toHaveBeenCalledTimes(1);
    doc.hidden = true;
    doc.fire('visibilitychange');
    expect(client.resume).toHaveBeenCalledTimes(1);
    doc.hidden = false;
    doc.fire('visibilitychange');
    expect(client.resume).toHaveBeenCalledTimes(2);
  });

  it('closes only on a real unload, and disposes', () => {
    const client = { resume: vi.fn(), close: vi.fn() };
    const win = target();
    const doc = target();
    const off = bindPageLifecycle(client, win, doc);
    win.fire('pagehide', { persisted: true });
    expect(client.close).not.toHaveBeenCalled();
    win.fire('pagehide', { persisted: false });
    expect(client.close).toHaveBeenCalledTimes(1);
    off();
    expect(win.count() + doc.count()).toBe(0);
  });
});
