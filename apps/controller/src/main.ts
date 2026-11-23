import { mountPhoneView } from './view/mount-phone-view';
import { ControllerClient } from './net/client';
import { loadSession, saveSession } from './net/session-store';
import { buildWsUrl } from './net/url';
import { mountLobbyView } from './ui/lobby-view';
import { lobbyErrorText } from './ui/lobby-logic';
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

/** Shows the in-match turn controls (the 3D view is mounted on welcome). */
function showGame(client: ControllerClient): void {
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
  client.on('welcome', (w) => {
    joinView.destroy();
    mountPhoneView(client);
    const lobby = mountLobbyView(screen, w.playerId, (m) => client.send(m));
    client.on('lobbyState', (s) => lobby.update(s));
    client.on('error', (e) => lobby.showError(lobbyErrorText(e.code, e.message)));
    client.on('matchStarted', () => {
      lobby.destroy();
      showGame(client);
    });
  });
  client.connect();
  joinView.update(client);
});
