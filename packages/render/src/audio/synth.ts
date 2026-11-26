import { BAR_SECONDS, musicBar } from './music.js';
import { recipeFor } from './recipes.js';
import type { CueId, CueRequest, Layer } from './recipes.js';

/** Window subset holding the (possibly prefixed) AudioContext constructor. */
export interface AudioWindow {
  AudioContext?: new () => AudioContext;
  webkitAudioContext?: new () => AudioContext;
}

/**
 * Context factory using `AudioContext` or Safari's prefixed constructor; undefined when neither exists.
 * @param win the window
 */
export function audioContextFactory(win: AudioWindow): (() => AudioContext) | undefined {
  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  return Ctor ? () => new Ctor() : undefined;
}

/** Options for {@link createSynth}. */
export interface SynthOptions {
  /** Context factory; undefined means Web Audio is missing (everything no-ops). */
  createContext: (() => AudioContext) | undefined;
  /** Initial mute. */
  muted?: boolean;
  /** Initial master volume 0..1. */
  volume?: number;
  /** Maximum simultaneously sounding layers; extra cues are dropped. */
  maxVoices?: number;
  /** Music bed level relative to master (0..1). */
  musicLevel?: number;
}

/** Minimum ms between plays of the same cue, so frequent cues (crawling, clicks) stay subtle. */
export const CUE_COOLDOWN_MS: Readonly<Partial<Record<CueId, number>>> = {
  squelch: 260,
  land: 90,
  jump: 80,
  airJump: 80,
  uiClick: 40,
  weaponSelect: 60,
};

/** Shared audio engine: lazy context, master/music/sfx buses, voice cap. */
export interface Synth {
  /** Creates/resumes the context; call synchronously from a user gesture. */
  unlock(): void;
  /** True once the context is running. */
  isUnlocked(): boolean;
  /** Plays a cue now (no-op while muted, locked or unsupported). */
  play(req: CueRequest): void;
  /** Starts the looping music bed (idempotent). */
  startMusic(): void;
  /** Stops the music bed. */
  stopMusic(): void;
  setMuted(m: boolean): void;
  isMuted(): boolean;
  setVolume(v: number): void;
  getVolume(): number;
  /** Currently counted active voices. */
  voices(): number;
  dispose(): void;
}

interface Buses {
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function noiseBuffer(ctx: AudioContext, dur: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function source(ctx: AudioContext, l: Layer, t0: number): AudioScheduledSourceNode {
  if (l.wave === 'noise') {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx, l.dur);
    return s;
  }
  const osc = ctx.createOscillator();
  osc.type = l.wave;
  osc.frequency.setValueAtTime(l.from, t0);
  if (l.to !== l.from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, l.to), t0 + l.dur);
  return osc;
}

/** Plays one layer into `bus`; `done` fires when it ends. Throws are the caller's to catch. */
function playLayer(ctx: AudioContext, bus: GainNode, l: Layer, done: () => void): void {
  const t0 = ctx.currentTime + (l.delay ?? 0);
  const src = source(ctx, l, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0.0002, l.gain), t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + l.dur);
  let node: AudioNode = src;
  if (l.filter && typeof ctx.createBiquadFilter === 'function') {
    const f = ctx.createBiquadFilter();
    f.type = l.filter.type;
    f.frequency.value = l.filter.freq;
    if (l.filter.q !== undefined) f.Q.value = l.filter.q;
    node.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(bus);
  src.onended = done;
  src.start(t0);
  src.stop(t0 + l.dur + 0.02);
}

/** Counts live layers and drops new ones past the cap. */
function createVoicePool(cap: number): {
  run(ctx: AudioContext, bus: GainNode, ls: readonly Layer[]): void;
  count(): number;
} {
  let active = 0;
  const run = (ctx: AudioContext, bus: GainNode, ls: readonly Layer[]): void => {
    for (const l of ls) {
      if (active >= cap) return;
      active++;
      let ended = false;
      const done = (): void => {
        if (!ended) {
          ended = true;
          active = Math.max(0, active - 1);
        }
      };
      try {
        playLayer(ctx, bus, l, done);
        setTimeout(done, ((l.delay ?? 0) + l.dur + 0.5) * 1000);
      } catch {
        done();
      }
    }
  };
  return { run, count: () => active };
}

/** Builds master/sfx/music buses and plays the silent buffer that unlocks iOS output. */
function buildGraph(ctx: AudioContext, musicLevel: number): Buses {
  const master = ctx.createGain();
  const sfx = ctx.createGain();
  const music = ctx.createGain();
  music.gain.value = musicLevel;
  sfx.connect(master);
  music.connect(master);
  master.connect(ctx.destination);
  const p = ctx.createBufferSource();
  p.buffer = ctx.createBuffer(1, 1, 22050);
  p.connect(ctx.destination);
  p.start(0);
  return { master, sfx, music };
}

/** A bar-by-bar timer: `onBar(n)` fires immediately on start, then every bar. */
function createMusicLoop(onBar: (bar: number) => void): { start(): void; stop(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let on = false;
  let bar = 0;
  const tick = (): void => {
    if (!on) return;
    onBar(bar++);
    timer = setTimeout(tick, BAR_SECONDS * 1000);
  };
  const stop = (): void => {
    on = false;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const start = (): void => {
    if (on) return;
    on = true;
    tick();
  };
  return { start, stop };
}

/** Returns a predicate that is true when a cue plays again inside its cooldown. */
function createLimiter(): (id: CueId) => boolean {
  const lastPlayed = new Map<CueId, number>();
  return (id) => {
    const gap = CUE_COOLDOWN_MS[id];
    if (!gap) return false;
    const now = Date.now();
    const prev = lastPlayed.get(id);
    if (prev !== undefined && now - prev < gap) return true;
    lastPlayed.set(id, now);
    return false;
  };
}

/**
 * Creates the shared synth engine. Never throws: every Web Audio failure degrades to silence.
 * @param opts engine options
 */
export function createSynth(opts: SynthOptions): Synth {
  const musicLevel = opts.musicLevel ?? 0.6;
  let ctx: AudioContext | undefined;
  let buses: Buses | undefined;
  let muted = opts.muted ?? false;
  let volume = clamp01(opts.volume ?? 0.8);
  const pool = createVoicePool(opts.maxVoices ?? 24);

  const applyMaster = (): void => {
    if (buses) buses.master.gain.value = muted ? 0 : volume;
  };
  const running = (): boolean => !!ctx && String(ctx.state) === 'running';
  const unlock = (): void => {
    try {
      if (!ctx && opts.createContext) {
        ctx = opts.createContext();
        buses = buildGraph(ctx, musicLevel);
        applyMaster();
      }
      if (ctx && String(ctx.state) !== 'running' && ctx.state !== 'closed') {
        void Promise.resolve(ctx.resume()).catch(() => undefined);
      }
    } catch {
      /* audio unavailable */
    }
  };
  const layers = (ls: readonly Layer[], bus: 'sfx' | 'music'): void => {
    if (ctx && buses) pool.run(ctx, buses[bus], ls);
  };
  const limited = createLimiter();
  const play = (req: CueRequest): void => {
    if (muted || !ctx || ctx.state === 'closed' || limited(req.id)) return;
    if (!running()) unlock();
    layers(recipeFor(req), 'sfx');
  };
  const loop = createMusicLoop((bar) => {
    if (!muted && running()) layers(musicBar(bar), 'music');
  });
  const dispose = (): void => {
    loop.stop();
    void Promise.resolve(ctx?.close()).catch(() => undefined);
    ctx = undefined;
    buses = undefined;
  };
  return {
    unlock,
    isUnlocked: running,
    play,
    startMusic: loop.start,
    stopMusic: loop.stop,
    setMuted: (m) => void ((muted = m), applyMaster()),
    isMuted: () => muted,
    setVolume: (v) => void ((volume = clamp01(v)), applyMaster()),
    getVolume: () => volume,
    voices: pool.count,
    dispose,
  };
}
