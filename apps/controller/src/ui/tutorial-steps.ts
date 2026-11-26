import { LEGACY_KEYS, loadPrefsStrict, updatePrefs } from './prefs-store';
import type { PrefsStorage } from './prefs-store';

/** One coach-mark step. */
export interface TutorialStep {
  id: 'move' | 'aim' | 'power' | 'weapon' | 'fire';
  title: string;
  body: string;
}

/** The first-turn coach marks, in order. */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'move', title: 'Move', body: 'Drag the left stick to crawl. Tap Jump to hop over gaps.' },
  {
    id: 'aim',
    title: 'Aim',
    body: 'Drag on the right side to set your aim direction. The dotted arc shows the shot.',
  },
  {
    id: 'power',
    title: 'Power',
    body: 'Press and hold Fire: the power gauge fills up. Let go to shoot. A quick tap does nothing.',
  },
  {
    id: 'weapon',
    title: 'Weapons and techs',
    body: 'Tap Arms to pick a weapon. Tap the (i) on any weapon or tech to see what it does.',
  },
  { id: 'fire', title: 'Fire', body: 'Fire ends your turn. Take cover before the timer runs out.' },
];

/** Window event that opens the tutorial on demand (the help button and the settings panel). */
export const TUTORIAL_EVENT = 'snails:show-tutorial';

/**
 * Whether the tutorial may start by itself now. It never covers a live turn: it only opens while
 * another team plays, once, and only when wanted (not seen yet). Opening it on demand is always
 * possible through {@link TUTORIAL_EVENT}.
 * @param wanted `shouldShowTutorial` result
 * @param myTurn it is currently one of my teams' turns
 * @param alreadyStarted it already started by itself this session
 */
export function tutorialAutoStart(
  wanted: boolean,
  myTurn: boolean,
  alreadyStarted: boolean,
): boolean {
  return wanted && !myTurn && !alreadyStarted;
}

/** Legacy localStorage key for the "tutorial seen" flag (migrated into the prefs record). */
export const TUTORIAL_KEY = LEGACY_KEYS.tutorialSeen;

/** Tutorial progress; `index` is -1 once finished or skipped. */
export interface TutorialState {
  index: number;
}

/** Starting state. */
export const tutorialStart = (): TutorialState => ({ index: 0 });

/** Whether the tutorial is still showing. */
export const tutorialActive = (s: TutorialState): boolean =>
  s.index >= 0 && s.index < TUTORIAL_STEPS.length;

/**
 * Advances one step; finishing the last step ends the tutorial.
 * @param s current state
 */
export function tutorialNext(s: TutorialState): TutorialState {
  if (!tutorialActive(s)) return { index: -1 };
  return { index: s.index + 1 >= TUTORIAL_STEPS.length ? -1 : s.index + 1 };
}

/** Skips the whole tutorial. */
export const tutorialSkip = (): TutorialState => ({ index: -1 });

/**
 * Whether the tutorial was already seen; storage failures count as seen to avoid nagging.
 * @param storage storage or undefined
 */
export function loadTutorialSeen(storage: PrefsStorage | undefined): boolean {
  try {
    return loadPrefsStrict(storage).tutorialSeen;
  } catch {
    return true;
  }
}

/**
 * Stores or clears the seen flag; failures are ignored.
 * @param storage storage or undefined
 * @param seen new value
 */
export function saveTutorialSeen(storage: PrefsStorage | undefined, seen: boolean): void {
  updatePrefs(storage, { tutorialSeen: seen });
}

/**
 * Whether to show the tutorial now: not seen yet, and not an automated browser unless forced.
 * @param seen stored flag
 * @param search `location.search` (`tutorial=0` skips, `tutorial=1` forces)
 * @param webdriver `navigator.webdriver`
 */
export function shouldShowTutorial(seen: boolean, search: string, webdriver: boolean): boolean {
  const p = new URLSearchParams(search).get('tutorial');
  if (p === '1') return true;
  if (p === '0' || webdriver) return false;
  return !seen;
}
