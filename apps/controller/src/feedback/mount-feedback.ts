import type { ControllerClient } from '../net/client';
import { safeStorage } from '../platform/ios';
import { AUDIO_CHANGED_EVENT, audioContextFactory, createAudioEngine } from './audio';
import type { AudioWindow } from './audio';
import { createCuePlanner } from './cues';
import { BTN_CLASS, SLOT_RIGHT } from '../shell/layers';
import { browserHapticsEnv, playHaptic } from './haptics';

/**
 * Wires haptic + audio cues to server messages and adds a small mute toggle. Audio unlocks on
 * the first pointerdown. Returns a disposer.
 */
export function mountFeedback(
  parent: HTMLElement,
  client: ControllerClient,
  playerId: string | null,
): () => void {
  const planner = createCuePlanner(playerId);
  const audio = createAudioEngine(
    audioContextFactory(window as unknown as AudioWindow),
    safeStorage(),
  );
  const haptics = browserHapticsEnv(navigator, window);

  const onMsg = (msg: Parameters<typeof planner.plan>[0]): void => {
    for (const cue of planner.plan(msg)) {
      audio.play(cue);
      playHaptic(cue, haptics);
    }
  };
  const offs = (
    ['lobbyState', 'matchStarted', 'snapshot', 'turnStart', 'turnTimer', 'eventBatch'] as const
  ).map((t) => client.on(t, onMsg));

  // Unlock must run synchronously inside a gesture. iOS only counts touchend/pointerup/click as
  // activation (not pointerdown or touchstart), so listen to all and keep trying until running.
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click'] as const;
  const unlock = (): void => {
    audio.unlock();
    if (audio.isUnlocked()) GESTURES.forEach((g) => window.removeEventListener(g, unlock, true));
  };
  GESTURES.forEach((g) => window.addEventListener(g, unlock, true));
  // Returning from background / bfcache leaves the context suspended or interrupted.
  const onVisible = (): void => {
    if (!document.hidden) audio.unlock();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onVisible);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = BTN_CLASS;
  const label = (): void => {
    btn.textContent = audio.isMuted() ? '\u{1F507}' : '\u{1F50A}';
    btn.setAttribute('aria-label', audio.isMuted() ? 'Unmute' : 'Mute');
  };
  btn.addEventListener('click', () => {
    audio.setMuted(!audio.isMuted());
    label();
  });
  label();
  (document.getElementById(SLOT_RIGHT) ?? parent).append(btn);
  const onAudioChanged = (): void => {
    audio.syncFromStorage();
    label();
  };
  window.addEventListener(AUDIO_CHANGED_EVENT, onAudioChanged);

  return () => {
    window.removeEventListener(AUDIO_CHANGED_EVENT, onAudioChanged);
    offs.forEach((off) => off());
    GESTURES.forEach((g) => window.removeEventListener(g, unlock, true));
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', onVisible);
    btn.remove();
    audio.dispose();
  };
}
