import { mountPhoneView } from './view/mount-phone-view';
import { ControllerClient } from './net/client';
import { loadSession, saveSession } from './net/session-store';
import { buildWsUrl } from './net/url';
import { mountLobbyView } from './ui/lobby-view';
import { lobbyErrorText } from './ui/lobby-logic';
import { mountJoinView } from './ui/join-view';
import { parseRoomParam } from './ui/join-logic';
import { mountControls } from './controls/mount-controls';
import { weapons } from '@snails/content-base';
import { trackFacingSign } from './controls/facing-tracker';
import { mountDebugOverlay } from './debug/debug-overlay';
import { registerServiceWorker } from './pwa/register-sw';

if (import.meta.env.PROD) void registerServiceWorker(navigator);

const overlay = document.getElementById('overlay') as HTMLElement;
const screen = document.getElementById('screen') as HTMLElement;

const stored = loadSession(localStorage);
const initial = {
  name: stored?.name ?? '',
  room: parseRoomParam(location.search) || stored?.roomCode || '',
};

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
    const phone = mountPhoneView(client);
    mountDebugOverlay(client);
    const facing = trackFacingSign(client);
    // Mounted before lobbyState arrives so the controls learn our team.
    mountControls(overlay, client, {
      playerId: w.playerId,
      weapons,
      facingSign: facing.facingSign,
      onAimingChange: (a) => phone.handle.setAiming(a),
    });
    const lobby = mountLobbyView(screen, w.playerId, (m) => client.send(m));
    client.on('lobbyState', (s) => lobby.update(s));
    client.on('error', (e) => lobby.showError(lobbyErrorText(e.code, e.message)));
    client.on('matchStarted', () => {
      lobby.destroy();
    });
  });
  client.connect();
  joinView.update(client);
});
