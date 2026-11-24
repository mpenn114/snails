import { BTN_CLASS, SLOT_RIGHT } from '../shell/layers';
import type { HoldReveal } from './hold-reveal';
import { RESEARCH_CSS } from './research-view';

const TOAST_MS = 2500;

/** The static DOM of the research feature. */
export interface ResearchDom {
  screen: HTMLElement;
  button: HTMLButtonElement;
  holdBtn: HTMLButtonElement;
  closeBtn: HTMLElement;
  /** Shows a short toast. */
  say(text: string): void;
  /** Removes everything again. */
  dispose(): void;
}

function btn(cls: string, text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  return b;
}

/** Creates the stylesheet, screen, toast and the Research button (right column slot). */
export function createResearchDom(parent: HTMLElement): ResearchDom {
  const style = document.createElement('style');
  style.textContent = RESEARCH_CSS;
  const screen = document.createElement('div');
  screen.className = 'rs';
  screen.setAttribute('role', 'dialog');
  const head = document.createElement('div');
  head.className = 'rs-head';
  const calc = document.createElement('div');
  calc.className = 'rs-calc';
  const closeBtn = btn('rs-btn rs-close', 'Close');
  head.append(calc, closeBtn);
  screen.append(head);
  const toast = document.createElement('div');
  toast.className = 'rs-toast';
  toast.style.display = 'none';
  const button = btn(BTN_CLASS, 'Research');
  parent.append(style, screen, toast);
  (document.getElementById(SLOT_RIGHT) ?? parent).append(button);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    screen,
    button,
    closeBtn,
    holdBtn: btn('rs-btn rs-hold', 'Hold to reveal research'),
    say(text) {
      toast.textContent = text;
      toast.style.display = 'block';
      clearTimeout(timer);
      timer = setTimeout(() => (toast.style.display = 'none'), TOAST_MS);
    },
    dispose() {
      clearTimeout(timer);
      for (const e of [style, screen, toast, button]) e.remove();
    },
  };
}

/** Wires press-and-hold on `holdBtn` to the state machine (release on up/cancel/leave/blur). */
export function wireHold(holdBtn: HTMLElement, hold: HoldReveal): void {
  holdBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    hold.press();
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave', 'blur'] as const) {
    holdBtn.addEventListener(t, () => hold.release());
  }
  holdBtn.addEventListener('contextmenu', (e) => e.preventDefault());
}
