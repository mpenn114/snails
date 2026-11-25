import type { SimEvent } from '@snails/core';
import { describe, expect, it, vi } from 'vitest';
import { musicBar } from './music.js';
import { createEventCueMapper, cuesForEvent } from './event-cues.js';
import {
  blastScale,
  heartbeatIntervalMs,
  recipeFor,
  shellTapHz,
  FIRE_VOICES,
  type CueId,
} from './recipes.js';
import {
  loadAudioSettings,
  muteFromQuery,
  parseAudioSettings,
  saveAudioSettings,
} from './settings.js';
import { audioContextFactory, createSynth } from './synth.js';

const ev = (e: unknown): SimEvent => e as SimEvent;

function fakeCtx() {
  const node = () => ({
    connect: (n: unknown) => n,
    gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    Q: { value: 0 },
    start: vi.fn(),
    stop: vi.fn(),
  });
  return {
    state: 'suspended',
    currentTime: 0,
    sampleRate: 100,
    destination: {},
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createOscillator: vi.fn(node),
    createGain: vi.fn(node),
    createBiquadFilter: vi.fn(node),
    createBufferSource: vi.fn(node),
    createBuffer: () => ({ getChannelData: () => new Float32Array(100) }),
  };
}

describe('recipes', () => {
  it('scales explosions by radius', () => {
    expect(blastScale(10).size).toBeGreaterThan(blastScale(1).size);
    expect(blastScale(undefined)).toEqual(blastScale(2.5));
    expect(blastScale(-1)).toEqual(blastScale(2.5));
    const big = recipeFor({ id: 'explosion', radius: 6 });
    const small = recipeFor({ id: 'explosion', radius: 1 });
    expect(big[0]!.dur).toBeGreaterThan(small[0]!.dur);
  });
  it('differs per weapon with a default', () => {
    const a = recipeFor({ id: 'fire', weaponId: 'base:radula-missile' });
    const d = recipeFor({ id: 'fire', weaponId: 'mod:unknown' });
    expect(a[0]!.from).not.toBe(d[0]!.from);
    expect(Object.keys(FIRE_VOICES).length).toBeGreaterThan(8);
  });
  it('pitches shell taps by material', () => {
    expect(shellTapHz('crystal')).toBeGreaterThan(shellTapHz('stone'));
    expect(shellTapHz('nope')).toBe(shellTapHz(undefined));
  });
  it('has a recipe for every cue', () => {
    const ids: CueId[] = [
      'fire',
      'explosion',
      'splash',
      'hurt',
      'crack',
      'death',
      'shellTap',
      'crystalChime',
      'heartbeat',
      'turnStart',
      'timerWarning',
      'researchComplete',
      'hillScored',
      'victory',
      'defeat',
    ];
    for (const id of ids) expect(recipeFor({ id }).length).toBeGreaterThan(0);
  });
  it('heartbeat speeds up as health falls', () => {
    expect(heartbeatIntervalMs(50)).toBeNull();
    expect(heartbeatIntervalMs(0)).toBeNull();
    expect(heartbeatIntervalMs(5)!).toBeLessThan(heartbeatIntervalMs(25)!);
  });
  it('music bars are deterministic and cycle', () => {
    expect(musicBar(1)).toEqual(musicBar(1));
    expect(musicBar(0)[0]!.from).toBe(musicBar(4)[0]!.from);
    expect(musicBar(-1).length).toBeGreaterThan(0);
  });
});

describe('event cues', () => {
  it('maps events', () => {
    expect(cuesForEvent(ev({ type: 'projectileFired', weaponId: 'w' }))).toEqual([
      { id: 'fire', weaponId: 'w' },
    ]);
    expect(cuesForEvent(ev({ type: 'explosion', weaponId: 'w', radius: 3 }))[0]).toMatchObject({
      id: 'explosion',
      radius: 3,
    });
    expect(cuesForEvent(ev({ type: 'snailDied' }))).toEqual([{ id: 'death' }]);
    expect(cuesForEvent(ev({ type: 'snailDrowned' }))).toEqual([{ id: 'splash' }]);
    expect(cuesForEvent(ev({ type: 'turnStarted', teamId: 't' }))).toEqual([{ id: 'turnStart' }]);
    expect(cuesForEvent(ev({ type: 'turnStarted', teamId: null }))).toEqual([]);
    expect(cuesForEvent(ev({ type: 'hillScored' }))).toEqual([{ id: 'hillScored' }]);
    expect(cuesForEvent(ev({ type: 'researchCompleted' }))).toEqual([{ id: 'researchComplete' }]);
    expect(cuesForEvent(ev({ type: 'matchEnded', status: 'won' }))).toEqual([{ id: 'victory' }]);
    expect(cuesForEvent(ev({ type: 'matchEnded', status: 'draw' }))).toEqual([]);
    expect(cuesForEvent(ev({ type: 'tick' }))).toEqual([]);
  });
  it('plays crack only when crossing a threshold', () => {
    const dmg = (amount: number, remaining: number) =>
      cuesForEvent(ev({ type: 'snailDamaged', amount, remaining }));
    expect(dmg(10, 80).map((c) => c.id)).toEqual(['hurt']);
    expect(dmg(20, 60).map((c) => c.id)).toEqual(['hurt', 'crack']);
    expect(dmg(50, 0).map((c) => c.id)).toEqual(['hurt']);
  });
  it('uses material for shell hits', () => {
    const m = createEventCueMapper({
      materialOf: (id) => (id === 'c' ? 'crystal' : id === 's' ? 'stone' : undefined),
    });
    const hit = (snailId?: string) => m.map([ev({ type: 'projectileHit', snailId })]);
    expect(hit('c')[0]!.id).toBe('crystalChime');
    expect(hit('s')[0]).toEqual({ id: 'shellTap', material: 'stone' });
    expect(hit('x')[0]).toEqual({ id: 'shellTap' });
    expect(hit()).toEqual([]);
  });
});

describe('settings', () => {
  it('parses defensively', () => {
    expect(parseAudioSettings(null)).toEqual({ muted: false, volume: 0.8 });
    expect(parseAudioSettings('{bad')).toEqual({ muted: false, volume: 0.8 });
    expect(parseAudioSettings('5')).toEqual({ muted: false, volume: 0.8 });
    expect(parseAudioSettings('{"muted":true,"volume":4}')).toEqual({ muted: true, volume: 1 });
    expect(parseAudioSettings('{"volume":"x"}').volume).toBe(0.8);
  });
  it('survives storage errors and round-trips', () => {
    const boom = (): never => {
      throw new Error('x');
    };
    const bad = { getItem: boom, setItem: boom };
    expect(loadAudioSettings(bad).volume).toBe(0.8);
    expect(() => saveAudioSettings(bad, { muted: true, volume: 0.1 })).not.toThrow();
    let v = '';
    const ok = {
      getItem: () => v,
      setItem: (_k: string, s: string) => {
        v = s;
      },
    };
    saveAudioSettings(ok, { muted: true, volume: 0.3 });
    expect(loadAudioSettings(ok)).toEqual({ muted: true, volume: 0.3 });
    expect(loadAudioSettings(undefined).muted).toBe(false);
  });
  it('reads the mute query', () => {
    expect(muteFromQuery('?mute=1')).toBe(true);
    expect(muteFromQuery('?mute=true')).toBe(true);
    expect(muteFromQuery('?mute=0')).toBe(false);
    expect(muteFromQuery('')).toBe(false);
  });
});

describe('synth', () => {
  it('no-ops without WebAudio', () => {
    const s = createSynth({ createContext: undefined });
    s.unlock();
    s.play({ id: 'fire' });
    s.startMusic();
    s.stopMusic();
    expect(s.isUnlocked()).toBe(false);
    s.dispose();
  });
  it('plays after unlock, respects mute, volume and voice cap', () => {
    const ctx = fakeCtx();
    const s = createSynth({ createContext: () => ctx as unknown as AudioContext, maxVoices: 3 });
    s.play({ id: 'fire' });
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    s.unlock();
    ctx.state = 'running';
    expect(s.isUnlocked()).toBe(true);
    s.play({ id: 'explosion', radius: 3 });
    expect(ctx.createOscillator).toHaveBeenCalled();
    s.play({ id: 'victory' });
    expect(s.voices()).toBeLessThanOrEqual(3);
    s.setVolume(2);
    expect(s.getVolume()).toBe(1);
    s.setMuted(true);
    expect(s.isMuted()).toBe(true);
    const n = ctx.createOscillator.mock.calls.length;
    s.play({ id: 'fire' });
    expect(ctx.createOscillator.mock.calls.length).toBe(n);
    s.dispose();
    expect(ctx.close).toHaveBeenCalled();
  });
  it('swallows synthesis errors and loops music', () => {
    vi.useFakeTimers();
    const ctx = fakeCtx();
    ctx.state = 'running';
    const s = createSynth({ createContext: () => ctx as unknown as AudioContext });
    s.unlock();
    s.startMusic();
    s.startMusic();
    const n = ctx.createOscillator.mock.calls.length;
    expect(n).toBeGreaterThan(0);
    vi.advanceTimersByTime(4100);
    expect(ctx.createOscillator.mock.calls.length).toBeGreaterThan(n);
    ctx.createOscillator.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => s.play({ id: 'fire' })).not.toThrow();
    s.dispose();
    vi.useRealTimers();
  });
  it('builds a factory from prefixed constructors', () => {
    expect(audioContextFactory({})).toBeUndefined();
    const W = vi.fn();
    audioContextFactory({ webkitAudioContext: W as never })?.();
    expect(W).toHaveBeenCalled();
  });
});
