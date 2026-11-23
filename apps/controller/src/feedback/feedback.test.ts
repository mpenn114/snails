import { describe, expect, it, vi } from 'vitest';
import type { ServerMessage, SimEventData } from '@snails/protocol';
import { encodeEventBatch } from '@snails/protocol';
import { createAudioEngine, MUTE_KEY } from './audio';
import { createCuePlanner } from './cues';
import { HAPTIC_PATTERNS, playHaptic } from './haptics';

const lobby = {
  type: 'lobbyState',
  roomCode: 'A',
  hostId: null,
  players: [{ id: 'p1', teamId: 'red' }],
} as unknown as ServerMessage;
const started = {
  type: 'matchStarted',
  teams: [{ id: 'red', snails: [{ id: 'r1', name: 'r' }] }],
} as unknown as ServerMessage;
const snap = {
  type: 'snapshot',
  tick: 1,
  wind: [0, 0],
  turn: ['red', 'r1', 1, 1000, 1],
  snails: [['r1', 0, 0, 0, 0, 0, 0, 0, 100, 1, 0, 0]],
  projectiles: [],
} as unknown as ServerMessage;
const ev = (...e: SimEventData[]): ServerMessage => encodeEventBatch(1, e) as ServerMessage;
const V = (x: number) => ({ x, y: 0, z: 0 });

function planner() {
  const p = createCuePlanner('p1');
  [lobby, started, snap].forEach((m) => p.plan(m));
  return p;
}

describe('cue planner', () => {
  it('cues my turn start only', () => {
    const p = planner();
    const t = (teamId: string): ServerMessage => ({
      type: 'turnStart',
      teamId,
      snailId: 'x',
      durationMs: 1,
    });
    expect(p.plan(t('red'))).toEqual([{ kind: 'turnStart', own: true }]);
    expect(p.plan(t('blue'))).toEqual([]);
  });

  it('maps events: fire, near/far explosion, damage on my snail', () => {
    const p = planner();
    const out = p.plan(
      ev(
        {
          type: 'projectileFired',
          projectileId: 'a',
          weaponId: 'w',
          snailId: 'r1',
          position: V(0),
          velocity: V(1),
        },
        { type: 'explosion', position: V(2), radius: 1, weaponId: 'w' },
        { type: 'explosion', position: V(50), radius: 1, weaponId: 'w' },
        {
          type: 'snailDamaged',
          snailId: 'r1',
          amount: 5,
          remaining: 5,
          sourceSnailId: null,
          cause: 'fall',
        },
        {
          type: 'snailDamaged',
          snailId: 'other',
          amount: 5,
          remaining: 5,
          sourceSnailId: null,
          cause: 'fall',
        },
      ),
    );
    expect(out).toEqual([
      { kind: 'fire', own: true },
      { kind: 'explosion', own: true },
      { kind: 'explosion', own: false },
      { kind: 'damage', own: true },
    ]);
  });

  it('ticks once per second under 5 s, only own on my turn', () => {
    const p = planner();
    p.plan({ type: 'turnStart', teamId: 'red', snailId: 'r1', durationMs: 30000 });
    const timer = (ms: number): ServerMessage => ({ type: 'turnTimer', remainingMs: ms });
    expect(p.plan(timer(6000))).toEqual([]);
    expect(p.plan(timer(4900))).toEqual([{ kind: 'tick', own: true }]);
    expect(p.plan(timer(4500))).toEqual([]);
    expect(p.plan(timer(3900))).toHaveLength(1);
    expect(p.plan(timer(0))).toEqual([]);
  });
});

describe('haptics', () => {
  it('vibrates own cues, skips others, missing API and reduced motion', () => {
    const vibrate = vi.fn(() => true);
    const env = { vibrate, reducedMotion: () => false };
    expect(playHaptic({ kind: 'fire', own: true }, env)).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_PATTERNS.fire);
    expect(playHaptic({ kind: 'fire', own: false }, env)).toBe(false);
    expect(playHaptic({ kind: 'fire', own: true }, { reducedMotion: () => false })).toBe(false);
    expect(playHaptic({ kind: 'fire', own: true }, { vibrate, reducedMotion: () => true })).toBe(
      false,
    );
    const boom = {
      vibrate: () => {
        throw new Error('x');
      },
      reducedMotion: () => false,
    };
    expect(playHaptic({ kind: 'tick', own: true }, boom)).toBe(false);
  });
});

function fakeCtx() {
  const node = () => ({
    connect: (n: unknown) => n,
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    start: vi.fn(),
    stop: vi.fn(),
  });
  const ctx = {
    state: 'suspended',
    currentTime: 0,
    sampleRate: 100,
    destination: {},
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createOscillator: vi.fn(node),
    createGain: vi.fn(node),
    createBufferSource: vi.fn(node),
    createBuffer: () => ({ getChannelData: () => new Float32Array(100) }),
  };
  return ctx;
}

describe('audio engine', () => {
  it('does nothing before unlock, then creates and resumes once', () => {
    const ctx = fakeCtx();
    const create = vi.fn(() => ctx as unknown as AudioContext);
    const a = createAudioEngine(create);
    a.play({ kind: 'fire', own: true });
    expect(create).not.toHaveBeenCalled();
    a.unlock();
    a.unlock();
    expect(create).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalled();
    a.play({ kind: 'explosion', own: true });
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(ctx.createBufferSource).toHaveBeenCalled();
    a.dispose();
    expect(ctx.close).toHaveBeenCalled();
  });

  it('persists mute and respects it', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const ctx = fakeCtx();
    const a = createAudioEngine(() => ctx as unknown as AudioContext, storage);
    a.unlock();
    a.setMuted(true);
    expect(store.get(MUTE_KEY)).toBe('1');
    a.play({ kind: 'tick', own: true });
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    expect(createAudioEngine(undefined, storage).isMuted()).toBe(true);
  });

  it('degrades without WebAudio or with throwing storage', () => {
    const bad = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
    };
    const a = createAudioEngine(undefined, bad);
    a.unlock();
    a.setMuted(true);
    a.play({ kind: 'fire', own: true });
    expect(a.isMuted()).toBe(true);
    const thrower = createAudioEngine(() => {
      throw new Error('no');
    });
    expect(() => thrower.unlock()).not.toThrow();
  });
});
