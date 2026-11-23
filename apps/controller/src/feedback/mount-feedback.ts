import type { ControllerClient } from '../net/client';
import { createAudioEngine } from './audio';
import { createCuePlanner } from './cues';
import { browserHapticsEnv, playHaptic } from './haptics';

const SAFE_STORAGE = (): Storage | undefined => {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
};

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
  const AudioCtor = typeof AudioContext === 'undefined' ? undefined : () => new AudioContext();
  const audio = createAudioEngine(AudioCtor, SAFE_STORAGE());
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

  const unlock = (): void => audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.style.cssText =
    'position:fixed;top:calc(8px + env(safe-area-inset-top));right:calc(8px + env(safe-area-inset-right));' +
    'pointer-events:auto;min-width:44px;min-height:44px;border-radius:50%;border:0;background:rgba(16,24,32,.75);color:#fff;font-size:1.2rem';
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
    window.removeEventListener('pointerdown', unlock);
    btn.remove();
    audio.dispose();
  };
}
