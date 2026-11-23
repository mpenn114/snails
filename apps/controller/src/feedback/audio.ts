import type { Cue } from './cues';

/** Persistent mute flag key. */
export const MUTE_KEY = 'snails.muted';

/** Subset of Web Storage used for the mute flag. */
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
  dispose(): void;
}

/** Synthesis recipe for one cue. */
interface Tone {
  type: OscillatorType;
  from: number;
  to: number;
  dur: number;
  gain: number;
  noise?: boolean;
}

/** Recipes: chime, thump, noise burst, tick. */
export const TONES: Readonly<Record<Cue['kind'], Tone[]>> = {
  turnStart: [
    { type: 'sine', from: 660, to: 660, dur: 0.15, gain: 0.25 },
    { type: 'sine', from: 880, to: 880, dur: 0.3, gain: 0.25 },
  ],
  fire: [{ type: 'sine', from: 140, to: 50, dur: 0.18, gain: 0.5 }],
  damage: [{ type: 'square', from: 220, to: 110, dur: 0.15, gain: 0.15 }],
  explosion: [{ type: 'sine', from: 90, to: 30, dur: 0.6, gain: 0.5, noise: true }],
  tick: [{ type: 'square', from: 1200, to: 1200, dur: 0.03, gain: 0.1 }],
};

function readMuted(storage: MuteStorage | undefined): boolean {
  try {
    return storage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function playNoise(ctx: AudioContext, t0: number, tone: Tone): void {
  const len = Math.max(1, Math.floor(ctx.sampleRate * tone.dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  src.buffer = buf;
  g.gain.setValueAtTime(tone.gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + tone.dur);
  src.connect(g).connect(ctx.destination);
  src.start(t0);
}

function playTone(ctx: AudioContext, t0: number, tone: Tone): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.from, t0);
  if (tone.to !== tone.from) osc.frequency.exponentialRampToValueAtTime(tone.to, t0 + tone.dur);
  g.gain.setValueAtTime(tone.gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + tone.dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + tone.dur);
  if (tone.noise) playNoise(ctx, t0, tone);
}

/** Window subset holding the (possibly prefixed) AudioContext constructor. */
export interface AudioWindow {
  AudioContext?: new () => AudioContext;
  webkitAudioContext?: new () => AudioContext;
}

/** Context factory using `AudioContext` or Safari's prefixed `webkitAudioContext`; undefined when neither exists. */
export function audioContextFactory(win: AudioWindow): (() => AudioContext) | undefined {
  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  return Ctor ? () => new Ctor() : undefined;
}

/** Plays a one-sample silent buffer; on iOS this inside a gesture fully unlocks output. */
function prime(ctx: AudioContext): void {
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, 22050);
  src.connect(ctx.destination);
  src.start(0);
}

/** Creates the engine; `createContext` is injectable (undefined when WebAudio is unsupported). */
export function createAudioEngine(
  createContext: (() => AudioContext) | undefined,
  storage?: MuteStorage,
): AudioEngine {
  let ctx: AudioContext | undefined;
  let muted = readMuted(storage);

  const unlock = (): void => {
    try {
      if (!ctx && createContext) {
        ctx = createContext();
        prime(ctx);
      }
      // iOS also reports 'interrupted' (phone call, lock, route change): resume that too.
      if (ctx && String(ctx.state) !== 'running' && ctx.state !== 'closed') {
        void Promise.resolve(ctx.resume()).catch(() => undefined);
      }
    } catch {
      /* audio unavailable */
    }
  };
  const play = (cue: Cue): void => {
    if (muted || !ctx || ctx.state === 'closed') return;
    if (String(ctx.state) !== 'running') unlock();
    try {
      let t = ctx.currentTime;
      for (const tone of TONES[cue.kind]) {
        playTone(ctx, t, tone);
        t += tone.dur * 0.8;
      }
    } catch {
      /* ignore synthesis failures */
    }
  };
  const setMuted = (m: boolean): void => {
    muted = m;
    try {
      storage?.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  };
  const dispose = (): void => {
    try {
      void ctx?.close().catch(() => undefined);
    } catch {
      /* ignore */
    }
    ctx = undefined;
  };
  const isUnlocked = (): boolean => !!ctx && String(ctx.state) === 'running';
  return { unlock, isUnlocked, play, isMuted: () => muted, setMuted, dispose };
}
