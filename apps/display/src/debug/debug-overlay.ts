import { RateMeter } from '@snails/protocol';

/** Numbers shown by the display overlay. */
export interface DisplayDebugStats {
  snapshotHz: number;
  fps: number;
  /** Server tick of the latest snapshot (undefined before the first). */
  tick: number | undefined;
}

/** True when the URL asks for the overlay (`?debug`). */
export function debugRequested(search: string): boolean {
  return new URLSearchParams(search).has('debug');
}

/** Formats the overlay text, one line per metric. */
export function formatDisplayDebug(s: DisplayDebugStats): string[] {
  return [
    `snapshots ${s.snapshotHz.toFixed(1)} /s`,
    `fps ${Math.round(s.fps)}`,
    `tick ${s.tick ?? '--'}`,
  ];
}

/** Handle returned by {@link mountDebugOverlay}. */
export interface DisplayDebugOverlay {
  /** Call for every snapshot received (with its tick). */
  onSnapshot(tick: number): void;
  dispose(): void;
}

/** Mounts the `?debug` overlay (nothing is mounted otherwise; the handle is then inert). */
export function mountDebugOverlay(search: string, doc?: Document): DisplayDebugOverlay {
  if (!debugRequested(search)) return { onSnapshot() {}, dispose() {} };
  const d = doc ?? document;
  const el = d.createElement('pre');
  el.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:50;margin:0;padding:4px 8px;font:13px monospace;' +
    'color:#9f9;background:rgba(0,0,0,.6);pointer-events:none';
  d.body.appendChild(el);
  const snaps = new RateMeter();
  const frames = new RateMeter(1000);
  let tick: number | undefined;
  let raf = 0;
  const loop = (): void => {
    const now = performance.now();
    frames.mark(now);
    el.textContent = formatDisplayDebug({
      snapshotHz: snaps.rate(now),
      fps: frames.rate(now),
      tick,
    }).join('\n');
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return {
    onSnapshot(t) {
      tick = t;
      snaps.mark(performance.now());
    },
    dispose() {
      cancelAnimationFrame(raf);
      el.remove();
    },
  };
}
