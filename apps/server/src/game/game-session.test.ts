import { describe, expect, it } from 'vitest';
import { Inventory, MatchStarted, decodeSnapshot } from '@snails/protocol';
import {
  GameSession,
  type GameSessionOptions,
  type SessionClock,
  type SessionTeam,
} from './game-session.js';

const teams: SessionTeam[] = [
  { id: 'a', name: 'A', colour: '#f00', playerIds: ['p1'] },
  { id: 'b', name: 'B', colour: '#00f', playerIds: ['p2'] },
];
const settings = {
  turnTimeSeconds: 10,
  snailsPerTeam: 1,
  seed: 7,
  controlMode: 'perPlayer' as const,
};

function make(extra: Partial<GameSessionOptions> = {}): GameSession {
  return new GameSession({ settings, teams, ...extra });
}

/** Runs until the action phase begins (intro finished); returns the active player id. */
function toAction(s: GameSession): string {
  for (let i = 0; i < 100 && s.snapshot().turn[2] !== 1; i++) s.advance(100);
  return s.snapshot().turn[0] === 'a' ? 'p1' : 'p2';
}

describe('GameSession', () => {
  it('produces a valid matchStarted message', () => {
    expect(() => MatchStarted.parse(make().matchStartedMessage())).not.toThrow();
  });

  it('honours match settings: health, wind and the water level in snapshots', () => {
    const s = make({
      settings: { ...settings, startingHealth: 60, wind: 'off', suddenDeathRound: null },
    });
    const snap = decodeSnapshot(s.snapshot());
    expect(snap.snails.every((n) => n.health === 60)).toBe(true);
    expect(snap.wind.strength).toBe(0);
    expect(snap.waterLevel).toBe(s.matchStartedMessage().terrain.waterLevel);
    expect(s.matchStartedMessage().settings).toMatchObject({ startingHealth: 60, wind: 'off' });
  });

  it('is deterministic for equal seed and intents', () => {
    const run = (): unknown => {
      const s = make();
      const p = toAction(s);
      s.applyIntent(p, { type: 'aim', angle: 0.7, power: 0.8 });
      s.applyIntent(p, { type: 'fire' });
      s.advance(3000);
      return s.snapshot();
    };
    expect(run()).toEqual(run());
  });

  it('rejects intents from the wrong team, unknown players and wrong phase', () => {
    const s = make();
    expect(s.applyIntent('p1', { type: 'jump' })).toEqual({ ok: false, reason: 'wrong_phase' });
    const p = toAction(s);
    const other = p === 'p1' ? 'p2' : 'p1';
    expect(s.applyIntent(other, { type: 'jump' })).toEqual({ ok: false, reason: 'not_your_turn' });
    expect(s.applyIntent('nobody', { type: 'jump' })).toEqual({
      ok: false,
      reason: 'unknown_player',
    });
  });

  it('accepts valid intents, clamps aim and checks weapons', () => {
    const s = make();
    const p = toAction(s);
    expect(s.applyIntent(p, { type: 'move', direction: 'right' }).ok).toBe(true);
    expect(s.applyIntent(p, { type: 'jump' }).ok).toBe(true);
    expect(s.applyIntent(p, { type: 'aim', angle: 3, power: 1 }).ok).toBe(true);
    expect(s.applyIntent(p, { type: 'selectWeapon', weaponId: 'nope' }).ok).toBe(false);
    expect(s.applyIntent(p, { type: 'selectWeapon', weaponId: 'base:pebble-toss' }).ok).toBe(true);
    s.advance(50);
    const snap = s.snapshot();
    const snail = snap.snails.find((n) => n[0] === snap.turn[1]);
    expect(snail?.[10]).toBeLessThanOrEqual(1571);
  });

  it('reports every team inventory: finite stock counted, gated weapons locked', () => {
    const msg = make().inventoryMessage();
    expect(() => Inventory.parse(msg)).not.toThrow();
    expect(msg.teams.map((t) => t.teamId)).toEqual(['a', 'b']);
    const a = msg.teams[0];
    expect(a?.stock['base:slime-grenade']).toBeUndefined(); // gated: stock comes with the tech
    expect(a?.stock['base:pebble-toss']).toBeUndefined();
    expect(a?.locked['base:beetle-barrage']).toBe('beetle-calls');
    expect(a?.locked['base:pebble-toss']).toBeUndefined();
  });

  it('refuses to select a locked weapon and keeps the plain infinite default', () => {
    const s = make();
    const p = toAction(s);
    expect(s.applyIntent(p, { type: 'selectWeapon', weaponId: 'base:beetle-barrage' })).toEqual({
      ok: false,
      reason: 'weapon_locked',
    });
    expect(s.activeWeaponId).toBe('base:pebble-toss');
    expect(s.applyIntent(p, { type: 'selectWeapon', weaponId: 'base:shell-bash' }).ok).toBe(true);
    expect(s.activeWeaponId).toBe('base:shell-bash');
  });

  it('fire produces projectile events', () => {
    const types: string[] = [];
    const s = make({ onEvents: (b) => b.events.forEach((e) => types.push(e.type)) });
    const p = toAction(s);
    s.applyIntent(p, { type: 'aim', angle: 0.8, power: 0.7 });
    s.applyIntent(p, { type: 'fire' });
    s.advance(200);
    expect(types).toContain('projectileFired');
  });

  it('rotates the turn on timeout and emits callbacks', () => {
    const starts: string[] = [];
    const timers: number[] = [];
    const snaps: number[] = [];
    const s = make({
      onTurnStart: (i) => starts.push(i.teamId),
      onTurnTimer: (ms) => timers.push(ms),
      onSnapshot: (x) => snaps.push(x.tick),
    });
    for (let i = 0; i < 400 && starts.length < 2; i++) s.advance(100);
    expect(starts).toHaveLength(2);
    expect(starts[0]).not.toBe(starts[1]);
    expect(timers.length).toBeGreaterThan(3);
    expect(snaps.length).toBeGreaterThan(10);
  });

  it('caps steps per frame', () => {
    const s = make({ maxStepsPerFrame: 3 });
    s.advance(10_000);
    expect(s.tick).toBe(3);
  });

  it('drives the loop from an injected clock and stops', () => {
    let t = 0;
    let fn: (() => void) | null = null;
    const clock: SessionClock = {
      now: () => t,
      setInterval: (f) => {
        fn = f;
        return 1;
      },
      clearInterval: () => {
        fn = null;
      },
    };
    const s = make({ clock });
    s.start();
    s.start();
    t = 160;
    (fn as (() => void) | null)?.();
    expect(s.tick).toBeGreaterThan(0);
    s.stop();
    s.stop();
    expect(fn).toBeNull();
  });
});
