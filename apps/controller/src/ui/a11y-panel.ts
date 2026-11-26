import { loadAudioSettings, saveAudioSettings } from '@snails/render';
import { AUDIO_CHANGED_EVENT, MUTE_KEY } from '../feedback/audio';
import {
  REDUCED_MOTION_CSS,
  TEXT_SIZES,
  applyA11y,
  loadA11y,
  saveA11y,
  type A11ySettings,
  type TextSize,
} from './a11y-settings';
import { TUTORIAL_EVENT, saveTutorialSeen } from './tutorial-steps';

const CSS = `
.a11y-btn{position:fixed;left:calc(env(safe-area-inset-left) + 8px);bottom:calc(env(safe-area-inset-bottom) + 8px);z-index:60;
  min-width:44px;min-height:44px;border:0;border-radius:var(--snl-radius);font:inherit;font-weight:800;
  background:rgba(var(--snl-ink-rgb),.7);color:var(--snl-paper);opacity:.7;touch-action:manipulation}
.a11y-help{left:calc(env(safe-area-inset-left) + 60px)}
.a11y-tools{display:flex;gap:6px;pointer-events:auto}
.a11y-tools .a11y-btn{position:static;opacity:.85}
.a11y-panel{position:fixed;inset:auto 8px 60px 8px;z-index:60;max-width:420px;padding:12px;border-radius:var(--snl-radius);
  background:rgba(var(--snl-ink-rgb),.96);color:var(--snl-paper);font-family:var(--snl-font);font-size:var(--snl-text-m);display:none;
  touch-action:manipulation}
.a11y-panel.on{display:block}
.a11y-panel h2{margin:0 0 8px;font-size:var(--snl-text-l)}
.a11y-panel .row{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.a11y-panel button{min-height:44px;min-width:44px;flex:1;border:2px solid transparent;border-radius:var(--snl-radius);font:inherit;font-weight:700}
.a11y-panel button[aria-pressed=true]{border-color:var(--snl-paper)}
.a11y-panel label{display:flex;gap:8px;align-items:center;min-height:44px}`;

function build(doc: Document): HTMLElement {
  const root = doc.createElement('div');
  const sizes = TEXT_SIZES.map((s) => `<button type="button" data-size="${s}">${s}</button>`).join(
    '',
  );
  root.innerHTML = `<style>${CSS}${REDUCED_MOTION_CSS}</style>
    <button type="button" class="a11y-btn" aria-label="Accessibility settings" aria-expanded="false">Aa</button>
    <button type="button" class="a11y-btn a11y-help" aria-label="How to play">?</button>
    <div class="a11y-panel" role="dialog" aria-label="Accessibility settings"><h2>Accessibility</h2>
      <div class="row" role="group" aria-label="Text size">${sizes}</div>
      <label><input type="checkbox" class="rm" /> Reduce motion</label>
      <div class="row"><button type="button" class="tut-again">How to play</button></div>
      <label><input type="checkbox" class="snd-mute" /> Mute sound</label>
      <label>Volume <input type="range" class="snd-vol" min="0" max="100" step="5" aria-label="Volume" /></label></div>`;
  return root;
}

/**
 * Mounts the accessibility button and panel (text size, reduced motion) and applies the stored
 * settings immediately.
 * @param doc the document
 * @param storage persistent storage or undefined
 * @param media the `prefers-reduced-motion: reduce` media query list
 */
export function mountA11yPanel(
  doc: Document,
  storage: Storage | undefined,
  media: Pick<MediaQueryList, 'matches'>,
): void {
  let s: A11ySettings = loadA11y(storage);
  const el = build(doc);
  doc.body.appendChild(el);
  const btn = el.querySelector<HTMLButtonElement>('.a11y-btn')!;
  const panel = el.querySelector<HTMLElement>('.a11y-panel')!;
  const rm = el.querySelector<HTMLInputElement>('.rm')!;
  const sizeBtns = [...el.querySelectorAll<HTMLButtonElement>('[data-size]')];
  const paint = (): void => {
    applyA11y(doc.documentElement, s, media.matches);
    rm.checked = s.reducedMotion;
    for (const b of sizeBtns) b.setAttribute('aria-pressed', String(b.dataset.size === s.textSize));
  };
  const set = (next: A11ySettings): void => {
    s = next;
    saveA11y(storage, s);
    paint();
  };
  btn.addEventListener('click', () => {
    const on = panel.classList.toggle('on');
    btn.setAttribute('aria-expanded', String(on));
  });
  for (const b of sizeBtns) {
    b.addEventListener('click', () => set({ ...s, textSize: b.dataset.size as TextSize }));
  }
  rm.addEventListener('change', () => set({ ...s, reducedMotion: rm.checked }));
  el.querySelector('.tut-again')?.addEventListener('click', () => {
    saveTutorialSeen(storage, false);
    panel.classList.remove('on');
    btn.setAttribute('aria-expanded', 'false');
    window.dispatchEvent(new Event(TUTORIAL_EVENT));
  });
  el.querySelector('.a11y-help')?.addEventListener('click', () =>
    window.dispatchEvent(new Event(TUTORIAL_EVENT)),
  );
  paint();
  mountAudioControls(el, storage);
}

/**
 * Moves the "Aa" and "?" buttons out of their fixed bottom-left corner (where they sit on top of the
 * joystick and the lobby's Ready button) into a row inside `slot`, the shell's top-right button
 * column. Returns a function that puts them back in the corner.
 * @param doc the document
 * @param slot the container to adopt the buttons into (null: leave them in the corner)
 */
export function adoptA11yButtons(doc: Document, slot: HTMLElement | null): () => void {
  if (!slot) return () => undefined;
  const btns = [...doc.querySelectorAll<HTMLElement>('.a11y-btn')];
  const homes = btns.map((b) => ({ b, parent: b.parentElement, next: b.nextSibling }));
  const row = doc.createElement('div');
  row.className = 'a11y-tools';
  row.append(...btns);
  slot.append(row);
  return () => {
    for (const { b, parent, next } of homes) parent?.insertBefore(b, next);
    row.remove();
  };
}

/** Wires the mute checkbox and volume slider to storage and notifies the feedback engine. */
function mountAudioControls(el: HTMLElement, storage: Storage | undefined): void {
  const mute = el.querySelector<HTMLInputElement>('.snd-mute')!;
  const vol = el.querySelector<HTMLInputElement>('.snd-vol')!;
  const read = (): void => {
    const a = loadAudioSettings(storage);
    mute.checked = a.muted;
    vol.value = String(Math.round(a.volume * 100));
  };
  const write = (): void => {
    saveAudioSettings(storage, { muted: mute.checked, volume: Number(vol.value) / 100 });
    try {
      storage?.setItem(MUTE_KEY, mute.checked ? '1' : '0');
    } catch {
      // Storage is a convenience only.
    }
    window.dispatchEvent(new Event(AUDIO_CHANGED_EVENT));
  };
  mute.addEventListener('change', write);
  vol.addEventListener('input', write);
  el.querySelector('.a11y-btn')?.addEventListener('click', read);
  read();
}
