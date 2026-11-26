import type { ControllerClient } from '../net/client';
import { tryCapture } from '../platform/pointer';
import type { AimStore } from './aim-store';
import { createFireCharge, powerLabel } from './fire-charge';
import type { FireCharge } from './fire-charge';

/** Aim elevation used before anything is known (core's default aim). */
const FALLBACK_ANGLE = Math.PI / 4;
const FALLBACK_POWER = 0.5;

/** Last aim of the active snail as the server reported it (wire: mrad, permille). */
export function trackServerAim(client: ControllerClient): {
  angle: () => number | null;
  power: () => number | null;
  dispose: () => void;
} {
  let angle: number | null = null;
  let power: number | null = null;
  const off = client.on('snapshot', (s) => {
    const sn = s.snails.find((n) => n[0] === s.turn[1]);
    const a = sn?.[10];
    const p = sn?.[11];
    angle = typeof a === 'number' ? a / 1000 : null;
    power = typeof p === 'number' ? p / 1000 : null;
  });
  return { angle: () => angle, power: () => power, dispose: off };
}

/** Where the drag aim and the Fire button get their current angle and power from. */
export interface AimSource {
  angle(): number;
  power(): number;
}

/** Current aim: the local drag/charge first, then the server's, then core's default. */
export function aimSource(
  store: AimStore | undefined,
  server: ReturnType<typeof trackServerAim>,
): AimSource {
  return {
    angle: () => store?.state.aim?.angle ?? server.angle() ?? FALLBACK_ANGLE,
    power: () => store?.state.aim?.power ?? server.power() ?? FALLBACK_POWER,
  };
}

/** DOM events (pointer, keyboard, focus loss) of the Fire button feeding the charge controller. */
function bindFireEvents(
  button: HTMLElement,
  charge: FireCharge,
): { cancel(): void; dispose(): void } {
  let pointer: number | null = null;
  const down = (e: PointerEvent): void => {
    if (pointer !== null) return;
    e.preventDefault();
    pointer = e.pointerId;
    tryCapture(button, e.pointerId);
    charge.press();
  };
  const up = (e: PointerEvent): void => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    if (e.type === 'pointercancel') charge.cancel();
    else charge.release();
  };
  const keyDown = (e: KeyboardEvent): void => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.repeat) charge.press();
  };
  const keyUp = (e: KeyboardEvent): void => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    charge.release();
  };
  const cancel = (): void => {
    pointer = null;
    charge.cancel();
  };
  const noMenu = (e: Event): void => e.preventDefault();
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('keydown', keyDown);
  button.addEventListener('keyup', keyUp);
  button.addEventListener('contextmenu', noMenu);
  button.addEventListener('blur', cancel);
  window.addEventListener('blur', cancel);
  return {
    cancel,
    dispose() {
      cancel();
      button.removeEventListener('pointerdown', down);
      button.removeEventListener('pointerup', up);
      button.removeEventListener('pointercancel', up);
      button.removeEventListener('keydown', keyDown);
      button.removeEventListener('keyup', keyUp);
      button.removeEventListener('contextmenu', noMenu);
      button.removeEventListener('blur', cancel);
      window.removeEventListener('blur', cancel);
    },
  };
}

/** Options of {@link wireFireButton}. */
export interface FireButtonOptions {
  button: HTMLElement;
  /** The big power gauge (a `.ctl-gauge` with a fill and a label child). */
  gauge: HTMLElement;
  client: ControllerClient;
  aim: AimSource;
  store?: AimStore | undefined;
  /** Whether the selected weapon takes power. */
  needsCharge(): boolean;
}

/**
 * Wires Fire as press-and-hold: hold to charge the power gauge, release to shoot (see
 * `createFireCharge`). Keyboard: Space or Enter on the focused button works the same way.
 * Returns release/cancel handles and a disposer.
 */
export function wireFireButton(o: FireButtonOptions): { cancel(): void; dispose(): void } {
  const fill = o.gauge.querySelector<HTMLElement>('.ctl-gauge-fill');
  const label = o.gauge.querySelector<HTMLElement>('.ctl-gauge-pct');
  const show = (power: number | null): void => {
    o.gauge.classList.toggle('on', power !== null);
    o.button.classList.toggle('charging', power !== null);
    if (power === null) return;
    if (fill) fill.style.width = `${Math.round(power * 100)}%`;
    if (label) label.textContent = powerLabel(power);
  };
  const charge = createFireCharge({
    now: () => performance.now(),
    send: (m) => o.client.send(m),
    needsCharge: o.needsCharge,
    angle: o.aim.angle,
    onCharge: (angle, power) => {
      o.store?.setAimMode(true);
      o.store?.setAim(angle, power);
      show(power);
    },
    onEnd: (fired) => {
      show(null);
      if (!fired) o.gauge.classList.add('hint');
      if (!fired) setTimeout(() => o.gauge.classList.remove('hint'), 1500);
    },
    every: (fn, ms) => {
      const h = setInterval(fn, ms);
      return () => clearInterval(h);
    },
  });
  const events = bindFireEvents(o.button, charge);
  return {
    cancel: events.cancel,
    dispose() {
      events.dispose();
    },
  };
}
