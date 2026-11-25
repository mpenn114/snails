import { describe, expect, it } from 'vitest';
import {
  DEFAULT_A11Y,
  effectiveReducedMotion,
  loadA11y,
  parseA11y,
  saveA11y,
  textScaleVars,
} from './a11y-settings';
import { PREFS_KEY } from './prefs-store';

describe('a11y settings', () => {
  it('parses valid and invalid input', () => {
    expect(parseA11y('{"textSize":"large","reducedMotion":true}')).toEqual({
      textSize: 'large',
      reducedMotion: true,
    });
    expect(parseA11y('{"textSize":"huge"}')).toEqual(DEFAULT_A11Y);
    expect(parseA11y('nope')).toEqual(DEFAULT_A11Y);
    expect(parseA11y('5')).toEqual(DEFAULT_A11Y);
    expect(parseA11y(null)).toEqual(DEFAULT_A11Y);
  });
  it('round-trips through storage and survives throwing storage', () => {
    const m = new Map<string, string>();
    const st = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    saveA11y(st, { textSize: 'small', reducedMotion: true });
    expect(m.has(PREFS_KEY)).toBe(true);
    expect(loadA11y(st)).toEqual({ textSize: 'small', reducedMotion: true });
    const bad = {
      getItem: (): string => {
        throw new Error('x');
      },
      setItem: (): void => {
        throw new Error('x');
      },
    };
    expect(loadA11y(bad)).toEqual(DEFAULT_A11Y);
    expect(() => saveA11y(bad, DEFAULT_A11Y)).not.toThrow();
    expect(loadA11y(undefined)).toEqual(DEFAULT_A11Y);
  });
  it('combines toggle and media query', () => {
    expect(effectiveReducedMotion(DEFAULT_A11Y, false)).toBe(false);
    expect(effectiveReducedMotion(DEFAULT_A11Y, true)).toBe(true);
    expect(effectiveReducedMotion({ ...DEFAULT_A11Y, reducedMotion: true }, false)).toBe(true);
  });
  it('scales the type tokens', () => {
    const n = parseFloat(textScaleVars('normal')['--snl-text-m']!);
    expect(parseFloat(textScaleVars('large')['--snl-text-m']!)).toBeGreaterThan(n);
    expect(parseFloat(textScaleVars('small')['--snl-text-m']!)).toBeLessThan(n);
  });
});
