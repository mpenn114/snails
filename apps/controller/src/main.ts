import { injectTheme } from '@snails/render';
import { ControllerClient } from './net/client';
import { loadSession, saveSession } from './net/session-store';
import { buildWsUrl } from './net/url';
import { mountJoinView } from './ui/join-view';
import { parseRoomParam } from './ui/join-logic';
import { registerServiceWorker } from './pwa/register-sw';
import { installTouchGuards, safeStorage } from './platform/ios';
import { createMatchShell } from './shell/match-shell';
import { bindPageLifecycle } from './net/lifecycle';
import { mountA11yPanel } from './ui/a11y-panel';

injectTheme(document);
if (import.meta.env.PROD) void registerServiceWorker(navigator);

const screen = document.getElementById('screen') as HTMLElement;

installTouchGuards(document);
const storage = safeStorage();
mountA11yPanel(document, storage, matchMedia('(prefers-reduced-motion: reduce)'));
const stored = loadSession(storage);
const initial = {
  name: stored?.name ?? '',
  room: parseRoomParam(location.search) || stored?.roomCode || '',
};

const joinView = mountJoinView(screen, initial, (v) => {
  saveSession(storage, { name: v.name, roomCode: v.room });
  const client = new ControllerClient({
    url: buildWsUrl(location),
    name: v.name,
    roomCode: v.room,
  });
  client.onState(() => joinView.update(client));
  client.on('error', () => joinView.update(client));
  createMatchShell(client, screen, () => joinView.destroy());
  bindPageLifecycle(client, window, document);
  client.connect();
  joinView.update(client);
});
