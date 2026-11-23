import type { ControllerClient } from '../net/client';
import { attachPhoneView } from './phone-view-loader';
import type { PhoneViewHandle } from './phone-view-loader';
import { BTN_CLASS, SLOT_RIGHT } from '../shell/layers';

/**
 * Adds the full-screen 3D view container behind the UI plus a small battery-saver toggle, and
 * attaches the lazily loaded PhoneView to the client. Returns a disposer carrying the PhoneViewHandle as `handle` (e.g. for `handle.setAiming`).
 */
export function mountPhoneView(
  client: ControllerClient,
  doc: Document = document,
): (() => void) & { handle: PhoneViewHandle } {
  const container = doc.createElement('div');
  container.id = 'phone-view';
  container.style.cssText = 'position:fixed;inset:0;z-index:0';
  doc.body.insertBefore(container, doc.body.firstChild);

  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.textContent = 'Saver: off';
  toggle.className = BTN_CLASS;
  let on = false;
  const handle: PhoneViewHandle = attachPhoneView(client, container);
  toggle.addEventListener('click', () => {
    on = !on;
    toggle.textContent = `Saver: ${on ? 'on' : 'off'}`;
    handle.setBatterySaver(on);
  });
  (doc.getElementById(SLOT_RIGHT) ?? doc.body).appendChild(toggle);

  const dispose = (): void => {
    handle.dispose();
    container.remove();
    toggle.remove();
  };
  return Object.assign(dispose, { handle });
}
