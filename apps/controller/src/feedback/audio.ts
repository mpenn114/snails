import {
  audioContextFactory as sharedFactory,
  createSynth,
  loadAudioSettings,
  saveAudioSettings,
} from '@snails/render';
import type { AudioWindow as SharedAudioWindow, CueRequest } from '@snails/render';
import type { Cue } from './cues';

/** Persistent mute flag key. */
export const MUTE_KEY = 'snails.muted';

/** Window event the settings panel dispatches after changing audio settings. */
export const AUDIO_CHANGED_EVENT = 'snails:audio';

/** Subset of Web Storage used for the mute flag and audio settings. */
export interface MuteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Audio engine: synthesised cues, gesture-gated, mutable. */
export interface AudioEngine {
  /** Creates/resumes the context and primes it with a silent buffer; call synchronously from a user gesture. */
  unlock(): void;
  /** True once the context is running (iOS may also report `interrupted` after a call/lock). */
  isUnlocked(): boolean;
  play(cue: Cue): void;
  isMuted(): boolean;
  setMuted(m: boolean): void;
  /** Master volume 0..1. */
  setVolume(v: number): void;
  /** Re-reads mute and volume from storage (the settings panel wrote them). */
  syncFromStorage(): void;
  dispose(): void;
}

/** Shared-engine cue for each phone feedback cue kind. */
export const CUE_MAP: Readonly<Record<Cue['kind'], CueRequest>> = {
  turnStart: { id: 'turnStart' },
  fire: { id: 'fire' },
  damage: { id: 'hurt' },
  explosion: { id: 'explosion' },
  tick: { id: 'timerWarning' },
};

function readMuted(storage: MuteStorage | undefined): boolean {
  try {
    return storage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Window subset holding the (possibly prefixed) AudioContext constructor. */
export type AudioWindow = SharedAudioWindow;

/** Context factory using `AudioContext` or Safari's prefixed `webkitAudioContext`; undefined when neither exists. */
export const audioContextFactory = sharedFactory;

/** Creates the engine on the shared synth; `createContext` is injectable (undefined when WebAudio is unsupported). */
export function createAudioEngine(
  createContext: (() => AudioContext) | undefined,
  storage?: MuteStorage,
): AudioEngine {
  const stored = loadAudioSettings(storage);
  let muted = readMuted(storage) || stored.muted;
  const synth = createSynth({ createContext, muted, volume: stored.volume });
  const setMuted = (m: boolean): void => {
    muted = m;
    synth.setMuted(m);
    try {
      storage?.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* storage blocked */
    }
    saveAudioSettings(storage, { muted: m, volume: synth.getVolume() });
  };
  return {
    unlock: synth.unlock,
    isUnlocked: synth.isUnlocked,
    play: (cue) => synth.play(CUE_MAP[cue.kind]),
    isMuted: () => muted,
    setMuted,
    setVolume: (v) => {
      synth.setVolume(v);
      saveAudioSettings(storage, { muted, volume: synth.getVolume() });
    },
    syncFromStorage: () => {
      const s = loadAudioSettings(storage);
      muted = s.muted;
      synth.setMuted(s.muted);
      synth.setVolume(s.volume);
    },
    dispose: synth.dispose,
  };
}
