/** One coach-mark step. */
export interface TutorialStep {
  id: 'move' | 'aim' | 'power' | 'weapon' | 'fire';
  title: string;
  body: string;
}

/** The first-turn coach marks, in order. */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'move', title: 'Move', body: 'Drag the left stick to crawl. Tap jump to hop over gaps.' },
  {
    id: 'aim',
    title: 'Aim',
    body: 'Drag on the right side to aim. The dotted arc shows your shot.',
  },
  { id: 'power', title: 'Power', body: 'Hold Fire to charge the power bar, then let go to shoot.' },
  { id: 'weapon', title: 'Weapon', body: 'Tap the weapon button to pick something nastier.' },
  { id: 'fire', title: 'Fire', body: 'Fire ends your turn. Take cover before the timer runs out.' },
];

/** localStorage key for the "tutorial seen" flag. */
export const TUTORIAL_KEY = 'snails.tutorialSeen';

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
export function loadTutorialSeen(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return true;
  }
}

/**
 * Stores or clears the seen flag; failures are ignored.
 * @param storage storage or undefined
 * @param seen new value
 */
export function saveTutorialSeen(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined,
  seen: boolean,
): void {
  try {
    if (seen) storage?.setItem(TUTORIAL_KEY, '1');
    else storage?.removeItem(TUTORIAL_KEY);
  } catch {
    // Storage is a convenience only.
  }
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
