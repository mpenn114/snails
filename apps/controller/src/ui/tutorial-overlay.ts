import {
  TUTORIAL_STEPS,
  saveTutorialSeen,
  tutorialActive,
  tutorialNext,
  tutorialSkip,
  tutorialStart,
  type TutorialState,
} from './tutorial-steps';

const CSS = `
.tut{position:absolute;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom) + 120px);margin:auto;max-width:360px;
  padding:12px;border-radius:var(--snl-radius);background:rgba(var(--snl-ink-rgb),.95);color:var(--snl-paper);
  font-family:var(--snl-font);font-size:var(--snl-text-m);pointer-events:auto;touch-action:manipulation;
  animation:tut-in .25s ease-out}
@keyframes tut-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.tut h2{margin:0 0 4px;font-size:var(--snl-text-l)}
.tut p{margin:0 0 8px}
.tut .row{display:flex;gap:8px;align-items:center}
.tut button{min-height:44px;min-width:44px;flex:1;border:0;border-radius:var(--snl-radius);font:inherit;font-weight:700}
.tut small{opacity:.8}`;

/** Handle to the coach-mark overlay. */
export interface TutorialOverlay {
  /** Shows the tutorial from the first step. */
  start(): void;
  /** Removes the overlay. */
  destroy(): void;
}

/**
 * Mounts the skippable coach-mark overlay; finishing or skipping stores the seen flag.
 * Reduced motion and text size come from the root's settings (see a11y-settings).
 * @param parent a layer element (modal)
 * @param storage persistent storage or undefined
 */
export function mountTutorial(parent: HTMLElement, storage: Storage | undefined): TutorialOverlay {
  const el = document.createElement('div');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'How to play');
  el.hidden = true;
  const style = Object.assign(document.createElement('style'), { textContent: CSS });
  parent.append(style, el);
  let s: TutorialState = tutorialSkip();
  const paint = (): void => {
    if (!tutorialActive(s)) {
      el.hidden = true;
      el.className = '';
      return;
    }
    const step = TUTORIAL_STEPS[s.index]!;
    const last = s.index === TUTORIAL_STEPS.length - 1;
    el.className = 'tut';
    el.hidden = false;
    el.innerHTML = `<h2>${step.title}</h2><p>${step.body}</p><div class="row">
      <small>${s.index + 1}/${TUTORIAL_STEPS.length}</small>
      <button type="button" data-act="skip">Skip</button>
      <button type="button" data-act="next">${last ? 'Got it' : 'Next'}</button></div>`;
  };
  el.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    s = act === 'skip' ? tutorialSkip() : tutorialNext(s);
    if (!tutorialActive(s)) saveTutorialSeen(storage, true);
    paint();
  });
  return {
    start: () => {
      s = tutorialStart();
      paint();
    },
    destroy: () => {
      el.remove();
      style.remove();
    },
  };
}
