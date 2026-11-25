import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  LEGACY_KEYS,
  PREFS_KEY,
  loadPrefs,
  loadPrefsStrict,
  parsePrefs,
  updatePrefs,
} from './prefs-store';

function mem(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('prefs-store', () => {
  it('uses defaults for garbage, wrong types and unknown sizes', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{nope')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('3')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"textSize":"huge","reducedMotion":"yes"}')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"textSize":"large","tutorialSeen":true}')).toEqual({
      ...DEFAULT_PREFS,
      textSize: 'large',
      tutorialSeen: true,
    });
  });

  it('migrates legacy keys without losing values, then removes them on save', () => {
    const s = mem({
      [LEGACY_KEYS.a11y]: '{"textSize":"large","reducedMotion":true}',
      [LEGACY_KEYS.tutorialSeen]: '1',
      [LEGACY_KEYS.aimButtonUsed]: '1',
    });
    expect(loadPrefs(s)).toEqual({
      textSize: 'large',
      reducedMotion: true,
      tutorialSeen: true,
      aimButtonUsed: true,
    });
    updatePrefs(s, { textSize: 'small' });
    expect([...s.m.keys()]).toEqual([PREFS_KEY]);
    expect(loadPrefs(s)).toMatchObject({
      textSize: 'small',
      reducedMotion: true,
      tutorialSeen: true,
    });
  });

  it('survives storage that throws or is missing', () => {
    const bad = {
      getItem: (): string | null => {
        throw new Error('blocked');
      },
      setItem: (): void => {
        throw new Error('blocked');
      },
    };
    expect(loadPrefs(bad)).toEqual(DEFAULT_PREFS);
    expect(() => loadPrefsStrict(bad)).toThrow();
    expect(() => updatePrefs(bad, { reducedMotion: true })).not.toThrow();
    expect(loadPrefs(undefined)).toEqual(DEFAULT_PREFS);
  });
});
