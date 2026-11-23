import { mountPhoneView } from './view/mount-phone-view';
import { ControllerClient } from './net/client';
import { loadSession, saveSession } from './net/session-store';
import { buildWsUrl } from './net/url';
import { mountJoinView } from './ui/join-view';
import { parseRoomParam } from './ui/join-logic';
import { mountTurnControls } from './ui/turn-controls';
import { registerServiceWorker } from './pwa/register-sw';

if (import.meta.env.PROD) void registerServiceWorker(navigator);

const overlay = document.getElementById('overlay') as HTMLElement;
const screen = document.getElementById('screen') as HTMLElement;

const stored = loadSession(localStorage);
const initial = {
  name: stored?.name ?? '',
  room: parseRoomParam(location.search) || stored?.roomCode || '',
};

/** Placeholder until the lobby task lands: shows a joined notice plus the game view. */
function showLobbyPlaceholder(client: ControllerClient): void {
  screen.innerHTML =
    '<div class="join"><h1>Lobby</h1><p class="status">Joined. Waiting...</p></div>';
  mountPhoneView(client);
  mountTurnControls(overlay, client);
}

const joinView = mountJoinView(screen, initial, (v) => {
  saveSession(localStorage, { name: v.name, roomCode: v.room });
  const client = new ControllerClient({
    url: buildWsUrl(location),
    name: v.name,
    roomCode: v.room,
  });
  client.onState(() => joinView.update(client));
  client.on('error', () => joinView.update(client));
  client.on('welcome', () => {
    joinView.destroy();
    showLobbyPlaceholder(client);
  });
  client.connect();
  joinView.update(client);
});
