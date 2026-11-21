import type { RebuildStats } from '@snails/render';
import type { FrameStats } from './frame-stats.js';

/** Values shown by the overlay each refresh. */
export interface OverlayData {
  frames: FrameStats;
  rebuild: RebuildStats | null;
  calls: number;
  triangles: number;
  snails: number;
  tier: string;
  ticks: number;
}

/** Formats the overlay text (pure, testable). */
export function formatOverlay(d: OverlayData): string {
  const r = d.rebuild;
  const lines = [
    `FPS ${d.frames.fps.toFixed(1)}  1% low ${d.frames.fpsLow1.toFixed(1)}  frame ${d.frames.lastMs.toFixed(1)} ms`,
    `chunks: backlog ${r?.backlog ?? 0}  stalls ${r?.stalls ?? 0}  last ${(r?.lastFrameMs ?? 0).toFixed(1)} ms  worst ${(r?.worstFrameMs ?? 0).toFixed(1)} ms`,
    `applied ${r?.totalApplied ?? 0}  dispatched ${r?.totalDispatched ?? 0}`,
    `draw calls ${d.calls}  triangles ${d.triangles}`,
    `snails ${d.snails}  tier ${d.tier}  tick ${d.ticks}`,
  ];
  return lines.join('\n');
}

/** Creates a fixed-position DOM overlay; returns an updater taking fresh data. */
export function createOverlay(parent: HTMLElement): (d: OverlayData) => void {
  const el = document.createElement('pre');
  el.id = 'overlay';
  el.style.cssText =
    'position:fixed;top:8px;left:8px;margin:0;padding:6px 8px;background:rgba(0,0,0,.6);' +
    'color:#9f9;font:12px/1.35 monospace;pointer-events:none;z-index:10;border-radius:4px';
  parent.appendChild(el);
  return (d) => {
    el.textContent = formatOverlay(d);
  };
}
