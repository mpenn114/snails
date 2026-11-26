import type { ControlMode } from '@snails/protocol';
import { technologies, weapons } from '@snails/content-base';
import { createAimStore } from '../controls/aim-store';
import { mountControls } from '../controls/mount-controls';
import { trackScreenFacing } from '../controls/facing-tracker';
import { mountDebugOverlay } from '../debug/debug-overlay';
import { mountFeedback } from '../feedback/mount-feedback';
import type { ControllerClient } from '../net/client';
import { mountSpectate } from '../spectate/spectate-view';
import {
  TUTORIAL_EVENT,
  loadTutorialSeen,
  shouldShowTutorial,
  tutorialAutoStart,
} from '../ui/tutorial-steps';
import { mountTutorial } from '../ui/tutorial-overlay';
import { safeStorage } from '../platform/ios';
import { mountPassPhone, shouldPassPhone } from '../ui/pass-phone';
import { lobbyErrorText, playerTeams } from '../ui/lobby-logic';
import { mountLobbyView } from '../ui/lobby-view';
import { mountResearch } from '../research/mount-research';
import { mountPhoneView } from '../view/mount-phone-view';
import { SHELL_CSS, SLOT_LEFT, SLOT_RIGHT, SLOT_TOP, Z } from './layers';
import type { LayerName } from './layers';
import { createSessionGate } from './session-gate';

/** Creates a full-screen, click-through layer with its own stacking context. */
function makeLayer(name: LayerName): HTMLElement {
  const el = document.createElement('div');
  el.className = 'shell-layer';
  el.dataset.layer = name;
  el.style.zIndex = String(Z[name]);
  return el;
}

function slot(id: string, parent: HTMLElement): void {
  const el = document.createElement('div');
  el.id = id;
  parent.appendChild(el);
}

/** Creates the stylesheet and the four overlay layers (with their slots) in the body. */
function mountLayers(): Record<'style' | 'hud' | 'controls' | 'banners' | 'modal', HTMLElement> {
  const style = document.createElement('style');
  style.textContent = SHELL_CSS;
  const [hud, controls, banners, modal] = (['hud', 'controls', 'banners', 'modal'] as const).map(
    makeLayer,
  ) as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
  slot(SLOT_LEFT, hud);
  slot(SLOT_TOP, banners);
  slot(SLOT_RIGHT, banners);
  document.body.append(style, hud, controls, banners, modal);
  return { style, hud, controls, banners, modal };
}

/**
 * Mounts the tutorial. It opens by itself once while another team is playing (never during one of
 * my turns, so it costs no turn time), is hidden when my turn starts, and can be opened on demand
 * (help button, settings panel) at any time.
 */
function mountTutorialHelp(modal: HTMLElement): {
  onTurn: (mine: boolean) => void;
  destroy: () => void;
} {
  const storage = safeStorage();
  const overlay = mountTutorial(modal, storage);
  let started = false;
  const wanted = (): boolean =>
    shouldShowTutorial(loadTutorialSeen(storage), location.search, navigator.webdriver === true);
  const onDemand = (): void => overlay.start();
  window.addEventListener(TUTORIAL_EVENT, onDemand);
  return {
    onTurn: (mine) => {
      if (mine) return overlay.hide();
      if (!tutorialAutoStart(wanted(), mine, started)) return;
      started = true;
      overlay.start();
    },
    destroy: () => {
      window.removeEventListener(TUTORIAL_EVENT, onDemand);
      overlay.destroy();
    },
  };
}

/** Mounts the layers and every in-match module once; returns a disposer for all of it. */
function mountSession(client: ControllerClient, screen: HTMLElement, playerId: string): () => void {
  const { style, hud, controls, banners, modal } = mountLayers();
  const aimStore = createAimStore();
  const phone = mountPhoneView(client, document, aimStore);
  const disposeDebug = mountDebugOverlay(client);
  const facing = trackScreenFacing(client, () => phone.handle.cameraYaw());
  // Mounted before lobbyState arrives so the controls learn our team.
  const disposeControls = mountControls(controls, client, {
    playerId,
    weapons,
    aimStore,
    techName: (id) => technologies.find((t) => t.id === id)?.name ?? id,
    screenFacing: facing.screenFacing,
    onAimingChange: (a) => phone.handle.setAiming(a),
  });
  const showLobby = (): ReturnType<typeof mountLobbyView> =>
    mountLobbyView(screen, playerId, (m) => client.send(m));
  const disposeSpectate = mountSpectate(modal, client, playerId, () => {
    lobby = showLobby();
  });
  const disposeFeedback = mountFeedback(banners, client, playerId);
  let lobby = showLobby();
  const pass = mountPassPhone(modal);
  const tutorial = mountTutorialHelp(modal);
  const disposeResearch = mountResearch(modal, client, playerId, technologies);

  let myTeams: readonly string[] = [];
  let mode: ControlMode = 'perPlayer';
  const teams = new Map<string, { name: string; colour: string }>();
  const offs = [
    client.on('lobbyState', (s) => {
      const me = s.players.find((p) => p.id === playerId);
      myTeams = me ? playerTeams(me) : [];
      lobby.update(s);
    }),
    client.on('turnStart', (t) => {
      tutorial.onTurn(myTeams.includes(t.teamId));
      if (!shouldPassPhone(mode, myTeams, t.teamId)) return pass.hide();
      pass.show(teams.get(t.teamId)?.name ?? t.teamId, undefined, teams.get(t.teamId)?.colour);
    }),
    client.on('error', (e) => lobby.showError(lobbyErrorText(e.code, e.message))),
    client.on('matchStarted', (m) => {
      mode = m.settings.controlMode;
      for (const t of m.teams) teams.set(t.id, { name: t.name, colour: t.colour });
      lobby.destroy();
    }),
  ];
  return () => {
    offs.forEach((off) => off());
    pass.destroy();
    tutorial.destroy();
    disposeResearch();
    disposeFeedback();
    disposeSpectate();
    disposeControls();
    facing.dispose();
    disposeDebug();
    phone();
    lobby.destroy();
    for (const el of [style, hud, controls, banners, modal]) el.remove();
  };
}

/**
 * Owns all in-match composition. On `welcome` it mounts the overlay layers (z-index constants in
 * `layers.ts`) and every module exactly once per session: the server repeats `welcome` on every
 * reconnect, which keeps the mounted UI; only a changed player id tears down and remounts.
 * @param onFirstWelcome runs on each mount (e.g. to remove the join form)
 * @returns a disposer
 */
export function createMatchShell(
  client: ControllerClient,
  screen: HTMLElement,
  onFirstWelcome: () => void,
): () => void {
  const gate = createSessionGate();
  let dispose: (() => void) | null = null;
  const off = client.on('welcome', (w) => {
    const action = gate.onWelcome(w.playerId);
    if (action === 'keep') return;
    dispose?.();
    onFirstWelcome();
    dispose = mountSession(client, screen, w.playerId);
  });
  return () => {
    off();
    dispose?.();
    dispose = null;
  };
}
