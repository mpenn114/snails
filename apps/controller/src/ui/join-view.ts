import type { ControllerClient } from '../net/client';
import { loadSession, canAutoResume } from '../net/session-store';
import { safeStorage } from '../platform/ios';
import { canJoin, normaliseRoom, statusText } from './join-logic';

/** Values entered on the join screen. */
export interface JoinValues {
  name: string;
  room: string;
}

/** Thin DOM join screen; `update` refreshes the status line and busy flag from the client. */
export function mountJoinView(
  root: HTMLElement,
  initial: JoinValues,
  onJoin: (v: JoinValues) => void,
): { update: (client: ControllerClient) => void; destroy: () => void } {
  const form = document.createElement('form');
  form.className = 'join';
  form.innerHTML = `<h1>Snails</h1>
    <input id="name" placeholder="Your name" maxlength="32" autocomplete="nickname" />
    <input id="room" placeholder="ROOM" maxlength="4" autocapitalize="characters" autocomplete="off" />
    <button class="primary" type="submit">Join</button><p class="status" role="status"></p>`;
  root.appendChild(form);
  const name = form.querySelector<HTMLInputElement>('#name')!;
  const room = form.querySelector<HTMLInputElement>('#room')!;
  const button = form.querySelector('button')!;
  const status = form.querySelector('.status')!;
  name.value = initial.name;
  room.value = initial.room;
  let busy = false;
  const refresh = (): void => {
    button.disabled = !canJoin(name.value, room.value, busy);
  };
  room.addEventListener('input', () => {
    room.value = normaliseRoom(room.value);
    refresh();
  });
  name.addEventListener('input', refresh);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!canJoin(name.value, room.value, busy)) return;
    onJoin({ name: name.value.trim(), room: room.value });
  });
  refresh();
  // A full reload with a stored session token rejoins automatically (deferred so the caller
  // has finished wiring the returned handle).
  if (canAutoResume(loadSession(safeStorage()), initial)) {
    setTimeout(() => onJoin({ name: initial.name.trim(), room: initial.room }), 0);
  }
  return {
    update: (client) => {
      busy = client.state === 'connecting' || client.state === 'reconnecting';
      status.textContent = statusText(client.state, client.lastError);
      refresh();
    },
    destroy: () => form.remove(),
  };
}
