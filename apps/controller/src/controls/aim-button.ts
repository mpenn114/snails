import type { AimStore } from './aim-store';

/** Label of the Aim button for the current state. */
export function aimButtonLabel(aimMode: boolean): string {
  return aimMode ? 'Exit aim' : 'Aim';
}

/** Storage key remembering that the player has used the Aim button (stops the attention pulse). */
export const AIM_SEEN_KEY = 'snails.aimButtonUsed';

function seen(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(AIM_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Wires the big Aim button to the shared aim store: tap toggles the aim view, the button shows
 * its state and pulses until the player has used it once (remembered in `storage`, which may be
 * missing or throw). Returns a disposer.
 */
export function wireAimButton(
  button: HTMLElement,
  store: AimStore,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage(),
): () => void {
  let used = seen(storage);
  const render = (): void => {
    const on = store.state.aimMode;
    button.textContent = aimButtonLabel(on);
    button.classList.toggle('on', on);
    button.classList.toggle('hint', !used && !on);
    button.setAttribute('aria-pressed', String(on));
  };
  const markUsed = (): void => {
    if (used) return;
    used = true;
    try {
      storage?.setItem(AIM_SEEN_KEY, '1');
    } catch {
      // Storage blocked: the pulse simply comes back next session.
    }
  };
  const onClick = (): void => {
    store.setAimMode(!store.state.aimMode);
    markUsed();
    render();
  };
  button.addEventListener('click', onClick);
  const off = store.subscribe(() => {
    if (store.state.aimMode) markUsed();
    render();
  });
  render();
  return () => {
    button.removeEventListener('click', onClick);
    off();
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
