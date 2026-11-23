import type { ControllerClient } from '../net/client';
import { safeStorage } from '../platform/ios';
import { audioContextFactory, createAudioEngine } from './audio';
import type { AudioWindow } from './audio';
import { createCuePlanner } from './cues';
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
  btn.style.cssText =
    'position:fixed;top:calc(8px + env(safe-area-inset-top));right:calc(8px + env(safe-area-inset-right));' +
    'pointer-events:auto;min-width:44px;min-height:44px;border-radius:50%;-webkit-touch-callout:none;border:0;background:rgba(16,24,32,.75);color:#fff;font-size:1.2rem';
  const label = (): void => {
    btn.textContent = audio.isMuted() ? '\u{1F507}' : '\u{1F50A}';
    btn.setAttribute('aria-label', audio.isMuted() ? 'Unmute' : 'Mute');
  };
  btn.addEventListener('click', () => {
    audio.setMuted(!audio.isMuted());
    label();
  });
  label();
  parent.append(btn);

  return () => {
    offs.forEach((off) => off());
    GESTURES.forEach((g) => window.removeEventListener(g, unlock, true));
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', onVisible);
    btn.remove();
    audio.dispose();
  };
}
