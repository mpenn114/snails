import { PREFS_KEY } from './prefs-store';
import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_STEPS,
  loadTutorialSeen,
  saveTutorialSeen,
  shouldShowTutorial,
  tutorialActive,
  tutorialNext,
  tutorialSkip,
  tutorialStart,
} from './tutorial-steps';

describe('tutorial steps', () => {
  it('walks every step then finishes', () => {
    let s = tutorialStart();
    for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
      expect(tutorialActive(s)).toBe(true);
      expect(s.index).toBe(i);
      s = tutorialNext(s);
    }
    expect(tutorialActive(s)).toBe(false);
    expect(tutorialNext(s).index).toBe(-1);
  });
  it('skip ends it', () => expect(tutorialActive(tutorialSkip())).toBe(false));
  it('covers the five controls', () =>
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual(['move', 'aim', 'power', 'weapon', 'fire']));
});

describe('seen flag', () => {
  const mem = (): Storage => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    } as unknown as Storage;
  };
  it('round-trips and clears', () => {
    const st = mem();
    expect(loadTutorialSeen(st)).toBe(false);
    saveTutorialSeen(st, true);
    expect(st.getItem(PREFS_KEY)).toContain('"tutorialSeen":true');
    expect(loadTutorialSeen(st)).toBe(true);
    saveTutorialSeen(st, false);
    expect(loadTutorialSeen(st)).toBe(false);
  });
  it('tolerates throwing storage', () => {
    const boom = (): never => {
      throw new Error('x');
    };
    const bad = { getItem: boom, setItem: boom, removeItem: boom };
    expect(loadTutorialSeen(bad)).toBe(true);
    expect(() => saveTutorialSeen(bad, true)).not.toThrow();
  });
  it('decides visibility', () => {
    expect(shouldShowTutorial(false, '', false)).toBe(true);
    expect(shouldShowTutorial(true, '', false)).toBe(false);
    expect(shouldShowTutorial(false, '', true)).toBe(false);
    expect(shouldShowTutorial(false, '?tutorial=0', false)).toBe(false);
    expect(shouldShowTutorial(true, '?tutorial=1', true)).toBe(true);
  });
});
