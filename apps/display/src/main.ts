import {
  MatchRenderer,
  QUALITY_TIERS,
  createAimHint,
  createGameView,
  pickDefaultTier,
} from '@snails/render';
import { injectTheme } from '@snails/render';
import type { QualityTier } from '@snails/render';

injectTheme(document);
import { DisplayClient, relativeWsUrl } from './net/client';
import { fetchInfo, buildJoinUrl } from './lobby/lobby-logic';
import { mountLobbyScreen } from './lobby/lobby-view';
import type { LobbyModel } from './lobby/lobby-view';
import { MatchAdapter } from './match/match-adapter';
import { mountHud } from './match/hud-view';
import { buildTerrainInit } from './match/terrain-init';
import { mountDebugOverlay } from './debug/debug-overlay';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);

function chooseTier(): QualityTier {
  const forced = QUALITY_TIERS.find((t) => t === params.get('tier'));
  if (forced) return forced;
  return pickDefaultTier({
    isMobile: /Android|iPhone|iPad/i.test(navigator.userAgent),
    dpr: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
  });
}

const tier = chooseTier();
const renderer = new MatchRenderer({
  now: () => performance.now(),
  modelBaseUrl: `${import.meta.env.BASE_URL}models/`,
  makeView: ({ bounds, waterLevel }) =>
    createGameView(canvas, { tier, terrainBounds: bounds, waterLevel }),
});
renderer.setTier(tier);
const onResize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', onResize);
onResize();

const aimHint = createAimHint();
renderer.addLayer(aimHint.layer);
const hud = mountHud(document.getElementById('lobby-root') as HTMLElement);
const lobby = mountLobbyScreen(document.getElementById('lobby-root') as HTMLElement);
const adapter = new MatchAdapter({
  renderer,
  aim: aimHint,
  buildInit: buildTerrainInit,
  onHud: hud.update,
  onMatchVisible: (visible) => hud.setVisible(visible),
});
const info = fetchInfo((u) => fetch(u));
const client = new DisplayClient(relativeWsUrl(location), params.get('room') ?? undefined);
const debug = mountDebugOverlay(location.search);
client.onMessage = (m) => {
  if (m.type === 'snapshot') debug.onSnapshot(m.tick);
  adapter.handle(m);
  if (m.type === 'lobbyState' && m.phase === 'lobby') {
    void info.then((i) => {
      const model: LobbyModel = {
        roomCode: m.roomCode,
        joinUrl: i ? buildJoinUrl(i.joinUrl, m.roomCode) : undefined,
        players: m.players,
        settings: m.settings,
      };
      lobby.update(model);
    });
  } else if (m.type === 'matchStarted') {
    lobby.hide();
  }
};
client.connect();
