import {
  MatchRenderer,
  QUALITY_TIERS,
  createAimHint,
  createGameView,
  motionConfig,
  resolveReducedMotion,
  pickDefaultTier,
  audioContextFactory,
  createSynth,
  loadAudioSettings,
  saveAudioSettings,
  muteFromQuery,
} from '@snails/render';
import type { AudioWindow } from '@snails/render';
import { createDisplayAudio } from './audio/display-audio';
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

// Audio: synthesised SFX and music bed; `?mute=1` silences it. Unlocks on the first gesture.
const audioSettings = loadAudioSettings(
  (() => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  })(),
);
const synth = createSynth({
  createContext: audioContextFactory(window as unknown as AudioWindow),
  muted: audioSettings.muted || muteFromQuery(location.search),
  volume: audioSettings.volume,
});
const displayAudio = createDisplayAudio(synth);
// Host shortcuts, remembered between launches: M toggles mute, [ and ] change the volume.
let displayMuted = audioSettings.muted;
window.addEventListener('keydown', (e) => {
  const step = e.key === ']' ? 0.1 : e.key === '[' ? -0.1 : 0;
  if (e.key.toLowerCase() !== 'm' && step === 0) return;
  if (step !== 0) synth.setVolume(Math.min(1, Math.max(0, synth.getVolume() + step)));
  else {
    displayMuted = !displayMuted;
    synth.setMuted(displayMuted);
  }
  try {
    saveAudioSettings(window.localStorage, { muted: displayMuted, volume: synth.getVolume() });
  } catch {
    // Storage is a convenience only.
  }
});
for (const g of ['pointerdown', 'keydown', 'click'] as const) {
  window.addEventListener(g, () => synth.unlock(), { once: false, capture: true });
}
synth.unlock();
setInterval(() => displayAudio.tick(performance.now()), 100);
const prevOnMessage = client.onMessage;
client.onMessage = (m) => {
  prevOnMessage(m);
  displayAudio.handle(m);
};
