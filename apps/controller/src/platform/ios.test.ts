import { describe, expect, it } from 'vitest';
import { capPixelRatio, installTouchGuards, isIos, isStandalone, safeStorage } from './ios';

describe('platform detection', () => {
  it('detects iPhone and iPadOS-as-Mac', () => {
    expect(isIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })).toBe(true);
    expect(isIos({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isIos({ userAgent: 'Android' })).toBe(false);
  });
  it('detects standalone via navigator.standalone or display-mode', () => {
    expect(isStandalone({ userAgent: '', standalone: true })).toBe(true);
    expect(isStandalone({ userAgent: '' }, () => ({ matches: true }))).toBe(true);
    expect(isStandalone({ userAgent: '' }, () => ({ matches: false }))).toBe(false);
    expect(
      isStandalone({ userAgent: '' }, () => {
        throw new Error('x');
      }),
    ).toBe(false);
    expect(isStandalone({ userAgent: '' })).toBe(false);
  });
});

describe('capPixelRatio', () => {
  it('caps at 2 on iOS only and sanitises bad input', () => {
    expect(capPixelRatio(3, true)).toBe(2);
    expect(capPixelRatio(3, false)).toBe(3);
    expect(capPixelRatio(1.5, true)).toBe(1.5);
    expect(capPixelRatio(0, true)).toBe(1);
    expect(capPixelRatio(Number.NaN, false)).toBe(1);
  });
});

describe('safeStorage', () => {
  const ok = { setItem: () => undefined, removeItem: () => undefined } as unknown as Storage;
  it('returns working storage', () => {
    expect(safeStorage(() => ok)).toBe(ok);
  });
  it('returns undefined when the accessor throws, is absent, or writes throw', () => {
    expect(
      safeStorage(() => {
        throw new Error('SecurityError');
      }),
    ).toBeUndefined();
    expect(safeStorage(() => undefined)).toBeUndefined();
    const full = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    } as unknown as Storage;
    expect(safeStorage(() => full)).toBeUndefined();
  });
});

describe('installTouchGuards', () => {
  function fake(): {
    l: Map<string, (e: Event) => void>;
    target: Parameters<typeof installTouchGuards>[0];
  } {
    const l = new Map<string, (e: Event) => void>();
    return {
      l,
      target: {
        addEventListener: (t, fn) => void l.set(t, fn),
        removeEventListener: (t) => void l.delete(t),
      },
    };
  }
  const ev = (touches?: number): { e: Event; prevented: () => boolean } => {
    let prevented = false;
    const e = {
      preventDefault: () => (prevented = true),
      ...(touches === undefined ? {} : { touches: { length: touches } }),
    } as unknown as Event;
    return { e, prevented: () => prevented };
  };
  it('cancels gesturestart and multi-touch moves but not single-touch moves', () => {
    const { l, target } = fake();
    installTouchGuards(target);
    const g = ev();
    l.get('gesturestart')?.(g.e);
    expect(g.prevented()).toBe(true);
    const one = ev(1);
    l.get('touchmove')?.(one.e);
    expect(one.prevented()).toBe(false);
    const two = ev(2);
    l.get('touchmove')?.(two.e);
    expect(two.prevented()).toBe(true);
  });
  it('disposer removes listeners', () => {
    const { l, target } = fake();
    installTouchGuards(target)();
    expect(l.size).toBe(0);
  });
});
