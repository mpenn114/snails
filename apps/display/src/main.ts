import { MatchRenderer, QUALITY_TIERS, createGameView, pickDefaultTier } from '@snails/render';
import type { QualityTier } from '@snails/render';
import { DisplayClient, relativeWsUrl } from './net/client';
import { fetchInfo, buildJoinUrl } from './lobby/lobby-logic';
import { mountLobbyScreen } from './lobby/lobby-view';
import type { LobbyModel } from './lobby/lobby-view';
import { routeServerMessage, type DisplayFeed } from './net/display-feed';

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
  makeView: ({ bounds, waterLevel }) =>
    createGameView(canvas, { tier, terrainBounds: bounds, waterLevel }),
});
renderer.setTier(tier);
const onResize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', onResize);
onResize();

const feed: DisplayFeed = {
  onInit: (init) => renderer.init(init),
  onSnapshot: (s) => void renderer.pushSnapshot(s),
  onEvents: (e) => renderer.handleEvents(e),
};

const lobby = mountLobbyScreen(document.getElementById('lobby-root') as HTMLElement);
const info = fetchInfo((u) => fetch(u));
const client = new DisplayClient(relativeWsUrl(location), params.get('room') ?? undefined);
client.onMessage = (m) => {
  if (m.type === 'lobbyState') {
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
  routeServerMessage(feed, m);
};
client.connect();
