import { mountPhoneView } from './view/mount-phone-view';
import { ControllerClient } from './net/client';
import { loadSession, saveSession } from './net/session-store';
import { buildWsUrl } from './net/url';
import { mountLobbyView } from './ui/lobby-view';
import { lobbyErrorText } from './ui/lobby-logic';
import { mountJoinView } from './ui/join-view';
import { parseRoomParam } from './ui/join-logic';
import { mountControls } from './controls/mount-controls';
import type { ControlMode } from '@snails/protocol';
import { weapons } from '@snails/content-base';
import { mountSpectate } from './spectate/spectate-view';
import { mountFeedback } from './feedback/mount-feedback';
import { mountPassPhone, shouldPassPhone } from './ui/pass-phone';
import { playerTeams } from './ui/lobby-logic';
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
    mountSpectate(overlay, client, w.playerId, () => {
      lobby = mountLobbyView(screen, w.playerId, (m) => client.send(m));
    });
    mountFeedback(overlay, client, w.playerId);
    let lobby = mountLobbyView(screen, w.playerId, (m) => client.send(m));
    const pass = mountPassPhone(screen);
    let myTeams: readonly string[] = [];
    let mode: ControlMode = 'perPlayer';
    const teamNames = new Map<string, string>();
    client.on('lobbyState', (s) => {
      const me = s.players.find((p) => p.id === w.playerId);
      myTeams = me ? playerTeams(me) : [];
      lobby.update(s);
    });
    client.on('turnStart', (t) => {
      if (shouldPassPhone(mode, myTeams, t.teamId)) pass.show(teamNames.get(t.teamId) ?? t.teamId);
      else pass.hide();
    });
    client.on('error', (e) => lobby.showError(lobbyErrorText(e.code, e.message)));
    client.on('matchStarted', (m) => {
      mode = m.settings.controlMode;
      for (const t of m.teams) teamNames.set(t.id, t.name);
      lobby.destroy();
    });
  });
  client.connect();
  joinView.update(client);
});
