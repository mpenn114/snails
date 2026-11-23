import type { ControllerClient } from '../net/client';
import { dragToAim } from './aim-mapping';
import { clampKnob, joystickDirection, onChange } from './joystick';
import type { MoveDirection } from './joystick';
import { createThrottle } from './throttle';

/** Joystick travel radius (px) and horizontal deadzone. */
const STICK_RADIUS = 60;
const STICK_DEADZONE = 18;
/** Aim sends at ~20 Hz. */
const AIM_INTERVAL_MS = 50;
const AIM_MAX_DRAG = 140;

/** Handle to a set of gestures. */
export interface Gestures {
  /** Releases everything held (sends move stop, hides aim visual). */
  release(): void;
  dispose(): void;
}

/** Drives a pointer-captured gesture: `move` gets offsets from the pointer-down origin. */
function trackPointer(
  el: HTMLElement,
  handlers: {
    down?: (x: number, y: number) => void;
    move: (dx: number, dy: number) => void;
    up: () => void;
  },
): () => void {
  let id: number | null = null;
  let ox = 0;
  let oy = 0;
  const onDown = (e: PointerEvent): void => {
    if (id !== null) return;
    id = e.pointerId;
    ox = e.clientX;
    oy = e.clientY;
    el.setPointerCapture?.(id);
    handlers.down?.(ox, oy);
    handlers.move(0, 0);
  };
  const onMove = (e: PointerEvent): void => {
    if (e.pointerId === id) handlers.move(e.clientX - ox, e.clientY - oy);
  };
  const onEnd = (e: PointerEvent): void => {
    if (e.pointerId !== id) return;
    id = null;
    handlers.up();
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onEnd);
  el.addEventListener('pointercancel', onEnd);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onEnd);
    el.removeEventListener('pointercancel', onEnd);
    if (id !== null) handlers.up();
  };
}

/** Wires the joystick element to `move` intents (sent only on change). */
export function bindJoystick(
  stick: HTMLElement,
  knob: HTMLElement,
  client: ControllerClient,
): Gestures {
  let dir: MoveDirection = 'stop';
  const send = onChange<MoveDirection>((d) => client.send({ type: 'move', direction: d }), 'stop');
  const off = trackPointer(stick, {
    move(dx, dy) {
      const k = clampKnob(dx, dy, STICK_RADIUS);
      knob.style.transform = `translate(${k.x}px,${k.y}px)`;
      dir = joystickDirection(dx, STICK_DEADZONE, dir);
      send(dir);
    },
    up() {
      knob.style.transform = '';
      dir = 'stop';
      send(dir);
    },
  });
  return {
    release() {
      knob.style.transform = '';
      dir = 'stop';
      send(dir);
    },
    dispose: off,
  };
}

/** Wires the aim zone: drag vector from touch-down becomes a throttled `aim` intent. */
export function bindAim(
  zone: HTMLElement,
  marker: HTMLElement,
  client: ControllerClient,
  facingSign: () => 1 | -1,
  onAiming?: (aiming: boolean) => void,
): Gestures {
  const throttle = createThrottle<{ angle: number; power: number }>(
    (a) => client.send({ type: 'aim', ...a }),
    AIM_INTERVAL_MS,
    {
      now: () => performance.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
  );
  const off = trackPointer(zone, {
    down(x, y) {
      const r = zone.getBoundingClientRect();
      marker.style.cssText = `display:block;left:${x - r.left}px;top:${y - r.top}px`;
      onAiming?.(true);
    },
    move(dx, dy) {
      const a = dragToAim(dx, dy, facingSign(), AIM_MAX_DRAG);
      if (a) throttle.push(a);
    },
    up() {
      marker.style.display = 'none';
      onAiming?.(false);
    },
  });
  const release = (): void => {
    marker.style.display = 'none';
    onAiming?.(false);
  };
  return {
    release,
    dispose() {
      off();
      throttle.cancel();
    },
  };
}
