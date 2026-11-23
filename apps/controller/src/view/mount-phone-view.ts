import type { ControllerClient } from '../net/client';
import { attachPhoneView } from './phone-view-loader';
import type { PhoneViewHandle } from './phone-view-loader';

/**
 * Adds the full-screen 3D view container behind the UI plus a small battery-saver toggle, and
 * attaches the lazily loaded PhoneView to the client. Returns a disposer.
 */
export function mountPhoneView(client: ControllerClient, doc: Document = document): () => void {
  const container = doc.createElement('div');
  container.id = 'phone-view';
  container.style.cssText = 'position:fixed;inset:0;z-index:0';
  doc.body.insertBefore(container, doc.body.firstChild);

  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.textContent = 'Battery saver: off';
  toggle.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:5;padding:6px 10px;font-size:0.8rem;opacity:0.7';
  let on = false;
  const handle: PhoneViewHandle = attachPhoneView(client, container);
  toggle.addEventListener('click', () => {
    on = !on;
    toggle.textContent = `Battery saver: ${on ? 'on' : 'off'}`;
    handle.setBatterySaver(on);
  });
  doc.body.appendChild(toggle);

  return () => {
    handle.dispose();
    container.remove();
    toggle.remove();
  };
}
