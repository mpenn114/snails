import type { FreeCameraInput } from './camera-rig.js';

/**
 * Wires pointer drag (left = orbit, right/shift = pan) and wheel (zoom) on an element to a
 * free-camera input sink. Returns an unbind function. Not unit-tested (needs a DOM).
 */
export function bindCameraInput(
  el: HTMLElement,
  apply: (input: FreeCameraInput) => void,
  sensitivity = { orbit: 0.005, pan: 0.05, zoom: 0.001 },
): () => void {
  let last: { x: number; y: number; pan: boolean } | null = null;
  const down = (e: PointerEvent): void => {
    last = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
  };
  const move = (e: PointerEvent): void => {
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    if (last.pan) apply({ panDelta: { x: -dx * sensitivity.pan, y: dy * sensitivity.pan } });
    else apply({ orbitDelta: { x: -dx * sensitivity.orbit, y: dy * sensitivity.orbit } });
    last = { x: e.clientX, y: e.clientY, pan: last.pan };
  };
  const up = (): void => {
    last = null;
  };
  const wheel = (e: WheelEvent): void => {
    e.preventDefault();
    apply({ zoomDelta: e.deltaY * sensitivity.zoom });
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('wheel', wheel, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointerleave', up);
    el.removeEventListener('wheel', wheel);
  };
}
