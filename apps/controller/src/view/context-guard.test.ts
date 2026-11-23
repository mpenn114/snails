import { describe, expect, it, vi } from 'vitest';
import { guardContextLoss } from './context-guard';

describe('guardContextLoss', () => {
  it('prevents default on loss, reports both events, and disposes', () => {
    const l = new Map<string, (e: Event) => void>();
    const target = {
      addEventListener: (t: string, f: (e: Event) => void) => void l.set(t, f),
      removeEventListener: (t: string) => void l.delete(t),
    };
    const h = { onLost: vi.fn(), onRestored: vi.fn() };
    const off = guardContextLoss(target, h);
    const preventDefault = vi.fn();
    l.get('webglcontextlost')?.({ preventDefault } as unknown as Event);
    expect(preventDefault).toHaveBeenCalled();
    expect(h.onLost).toHaveBeenCalledTimes(1);
    l.get('webglcontextrestored')?.({} as Event);
    expect(h.onRestored).toHaveBeenCalledTimes(1);
    off();
    expect(l.size).toBe(0);
  });
});
