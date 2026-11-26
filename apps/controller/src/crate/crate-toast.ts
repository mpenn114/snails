import type { WireEvent } from '@snails/protocol';
import type { ControllerClient } from '../net/client';

const TOAST_MS = 3000;

/** Toast texts for crates collected by one of `myTeams` (pure). */
export function crateToasts(events: readonly WireEvent[], myTeams: readonly string[]): string[] {
  return events.flatMap((e) =>
    e.type === 'crateCollected' && myTeams.includes(e.teamId) ? [`Crate: ${e.text}`] : [],
  );
}

/** Shows a short toast on this phone when its team collects a crate. Returns a disposer. */
export function mountCrateToast(
  parent: HTMLElement,
  client: ControllerClient,
  getMyTeams: () => readonly string[],
): () => void {
  const toast = document.createElement('div');
  toast.className = 'rs-toast crate-toast';
  toast.setAttribute('role', 'status');
  toast.style.display = 'none';
  parent.append(toast);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const off = client.on('eventBatch', (b) => {
    const texts = crateToasts(b.events, getMyTeams());
    if (texts.length === 0) return;
    toast.textContent = texts.join(' | ');
    toast.style.display = 'block';
    clearTimeout(timer);
    timer = setTimeout(() => (toast.style.display = 'none'), TOAST_MS);
  });
  return () => {
    off();
    clearTimeout(timer);
    toast.remove();
  };
}
