import { RateMeter } from '@snails/protocol';
import type { ControllerClient } from '../net/client';

/** Numbers shown by the overlay. */
export interface DebugStats {
  rttMs: number | undefined;
  cmdP50: number;
  cmdP90: number;
  cmdCount: number;
  snapshotHz: number;
  fps: number;
}

/** True when the URL asks for the overlay (`?debug`). */
export function debugRequested(search: string): boolean {
  return new URLSearchParams(search).has('debug');
}

/** Formats the overlay text, one line per metric. */
export function formatDebugLines(s: DebugStats): string[] {
  return [
    `RTT ${s.rttMs === undefined ? '--' : `${Math.round(s.rttMs)} ms`}`,
    `cmd->effect p50 ${s.cmdP50} / p90 ${s.cmdP90} ms (n=${s.cmdCount})`,
    `snapshots ${s.snapshotHz.toFixed(1)} /s`,
    `fps ${Math.round(s.fps)}`,
  ];
}

/**
 * Mounts the debug overlay, hidden unless `?debug`; a three-finger tap toggles it. Returns a
 * disposer (removes the element and listeners, stops the frame loop).
 */
export function mountDebugOverlay(client: ControllerClient, doc: Document = document): () => void {
  const el = doc.createElement('pre');
  el.style.cssText =
    'position:fixed;left:calc(6px + env(safe-area-inset-left));top:calc(6px + env(safe-area-inset-top));z-index:50;margin:0;padding:4px 6px;font:11px monospace;' +
    'color:#9f9;background:rgba(0,0,0,.6);pointer-events:none;white-space:pre';
  el.hidden = !debugRequested(location.search);
  doc.body.appendChild(el);
  const frames = new RateMeter(1000);
  let raf = 0;
  const loop = (): void => {
    const now = performance.now();
    frames.mark(now);
    if (!el.hidden) {
      const sum = client.latency.summary();
      el.textContent = formatDebugLines({
        rttMs: client.rttMs,
        cmdP50: sum.p50,
        cmdP90: sum.p90,
        cmdCount: sum.count,
        snapshotHz: client.latency.snapshotRate(Date.now()),
        fps: frames.rate(now),
      }).join('\n');
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const onTouch = (e: TouchEvent): void => {
    if (e.touches.length === 3) el.hidden = !el.hidden;
  };
  doc.addEventListener('touchstart', onTouch, { passive: true });
  return () => {
    cancelAnimationFrame(raf);
    doc.removeEventListener('touchstart', onTouch);
    el.remove();
  };
}
