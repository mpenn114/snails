import {
  MatchRenderer,
  QUALITY_TIERS,
  createAimHint,
  createGameView,
  motionConfig,
  resolveReducedMotion,
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
import { bannerText, mountBanner } from './match/research-banner';
import { technologies } from '@snails/content-base';
import { buildTerrainInit } from './match/terrain-init';
import { mountDebugOverlay } from './debug/debug-overlay';
import { createTerrainProbe } from './debug/terrain-probe';
import { TERRAIN_TEXTURES } from './terrain-textures';

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
const motion = motionConfig(
  resolveReducedMotion(location.search, matchMedia('(prefers-reduced-motion: reduce)').matches),
);
const renderer = new MatchRenderer({
  now: () => performance.now(),
  modelBaseUrl: `${import.meta.env.BASE_URL}models/`,
  terrainTextures: TERRAIN_TEXTURES,
  rigOptions: { panSlowdown: motion.panSlowdown },
  makeView: ({ bounds, waterLevel }) =>
    createGameView(canvas, { tier, terrainBounds: bounds, waterLevel, postProcessing: true }),
});
renderer.setTier(tier);
const onResize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', onResize);
onResize();

const aimHint = createAimHint({
  isSolid: (p) => renderer.terrainReplica?.grid.isSolid(p) ?? false,
});
renderer.addLayer(aimHint.layer);
const hud = mountHud(document.getElementById('lobby-root') as HTMLElement);
const lobby = mountLobbyScreen(document.getElementById('lobby-root') as HTMLElement);
const banner = mountBanner(document.getElementById('lobby-root') as HTMLElement);
const techs = new Map(technologies.map((t) => [t.id, t]));
renderer.setTechVisuals((id) => techs.get(id)?.visual);
const adapter = new MatchAdapter({
  renderer,
  onResearchRevealed: (r) =>
    banner.show({
      text: bannerText(r.teamName, techs.get(r.techId)?.name ?? r.techId),
      colour: r.colour,
    }),
  aim: aimHint,
  buildInit: buildTerrainInit,
  onHud: hud.update,
  onMatchVisible: (visible) => hud.setVisible(visible),
});
(window as unknown as { __snailsTerrain: unknown }).__snailsTerrain = createTerrainProbe(
  () => renderer.terrainReplica,
);
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
