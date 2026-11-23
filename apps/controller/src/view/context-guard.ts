/** Canvas subset for WebGL context events. */
export interface ContextTarget {
  addEventListener(type: string, fn: (e: Event) => void): void;
  removeEventListener(type: string, fn: (e: Event) => void): void;
}

/** Reactions to WebGL context loss. */
export interface ContextHandlers {
  onLost(): void;
  onRestored(): void;
}

/**
 * Handles `webglcontextlost` / `webglcontextrestored` (iOS Safari drops contexts under memory
 * pressure or after backgrounding). Calling `preventDefault` on loss is what lets the browser
 * restore the context later. Returns a disposer.
 */
export function guardContextLoss(target: ContextTarget, h: ContextHandlers): () => void {
  const lost = (e: Event): void => {
    e.preventDefault();
    h.onLost();
  };
  const restored = (): void => h.onRestored();
  target.addEventListener('webglcontextlost', lost);
  target.addEventListener('webglcontextrestored', restored);
  return () => {
    target.removeEventListener('webglcontextlost', lost);
    target.removeEventListener('webglcontextrestored', restored);
  };
}
