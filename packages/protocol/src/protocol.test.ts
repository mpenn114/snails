import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, checkHello, parseClientMessage, parseServerMessage } from './index.js';

const settings = { turnTimeSeconds: 30, snailsPerTeam: 4, seed: 7 };

describe('client messages', () => {
  it('parses hello with optional room and session token', () => {
    const m = parseClientMessage({
      type: 'hello',
      role: 'display',
      name: 'TV',
      protocolVersion: PROTOCOL_VERSION,
    });
    expect(m.type).toBe('hello');
    expect(
      parseClientMessage({
        type: 'hello',
        role: 'controller',
        name: 'Ann',
        roomCode: 'ABCD',
        protocolVersion: 99,
        sessionToken: 'tok',
      }).type,
    ).toBe('hello');
  });
  it('parses lobby actions, intents and ping', () => {
    for (const m of [
      { type: 'createRoom' },
      { type: 'setTeam', teamId: 'red' },
      { type: 'setColour', colour: '#f00' },
      { type: 'setReady', ready: true },
      { type: 'startMatch', settings },
      { type: 'move', direction: 'stop' },
      { type: 'jump' },
      { type: 'aim', angle: 0.5, power: 0.5 },
      { type: 'steer', input: -0.5 },
      { type: 'selectWeapon', weaponId: 'bazooka' },
      { type: 'fire' },
      { type: 'endTurn' },
      { type: 'queueResearch', technologyId: 't' },
      { type: 'ping', t: 1 },
    ])
      expect(parseClientMessage(m).type).toBe(m.type);
  });
  it('rejects invalid messages', () => {
    expect(() => parseClientMessage({ type: 'nope' })).toThrow();
    expect(() => parseClientMessage({ type: 'aim', angle: 4, power: 0.5 })).toThrow();
    expect(() => parseClientMessage({ type: 'aim', angle: 1, power: 2 })).toThrow();
    expect(() => parseClientMessage({ type: 'steer', input: 1.5 })).toThrow();
    expect(() => parseClientMessage({ type: 'steer' })).toThrow();
    expect(() =>
      parseClientMessage({ type: 'startMatch', settings: { ...settings, snailsPerTeam: 0 } }),
    ).toThrow();
  });
});

describe('server messages', () => {
  it('parses aimPreview and rejects bad power', () => {
    const m = {
      type: 'aimPreview',
      snailId: 's1',
      weaponId: 'base:x',
      launch: { minSpeed: 1, maxSpeed: 2, gravityScale: 1, windScale: 1, projectileRadius: 0.2 },
      angle: 0.5,
      power: 0.3,
    };
    expect(parseServerMessage(m)).toEqual(m);
    expect(() => parseServerMessage({ ...m, power: 2 })).toThrow();
  });
  it('parses inventory and rejects negative stock', () => {
    const m = {
      type: 'inventory',
      teams: [{ teamId: 'a', stock: { 'base:x': 2 }, locked: { 'base:y': 'tech' } }],
    };
    expect(parseServerMessage(m)).toEqual(m);
    expect(() =>
      parseServerMessage({ ...m, teams: [{ teamId: 'a', stock: { 'base:x': -1 }, locked: {} }] }),
    ).toThrow();
  });
  it('parses lobby, welcome, error and match start', () => {
    expect(
      parseServerMessage({
        type: 'welcome',
        playerId: 'p1',
        roomCode: 'ABCD',
        sessionToken: 's',
        role: 'controller',
        protocolVersion: PROTOCOL_VERSION,
      }).type,
    ).toBe('welcome');
    expect(
      parseServerMessage({
        type: 'lobbyState',
        phase: 'lobby',
        roomCode: 'ABCD',
        hostId: 'p1',
        settings,
        players: [
          {
            id: 'p1',
            name: 'A',
            role: 'controller',
            teamId: null,
            colour: null,
            ready: false,
            connected: true,
          },
        ],
      }).type,
    ).toBe('lobbyState');
    expect(
      parseServerMessage({ type: 'error', code: 'protocol_mismatch', message: 'x', expected: 1 })
        .type,
    ).toBe('error');
    expect(() => parseServerMessage({ type: 'error', code: 'bogus', message: 'x' })).toThrow();
    expect(parseServerMessage({ type: 'pong', t: 3 }).type).toBe('pong');
    expect(parseServerMessage({ type: 'turnTimer', remainingMs: 100 }).type).toBe('turnTimer');
  });
});

describe('checkHello', () => {
  const hello = { type: 'hello', role: 'controller', name: 'A', protocolVersion: PROTOCOL_VERSION };
  it('accepts a matching version', () => {
    expect(checkHello(hello).ok).toBe(true);
  });
  it('reports a mismatch with both versions', () => {
    expect(checkHello({ ...hello, protocolVersion: 99 })).toEqual({
      ok: false,
      error: 'protocol_mismatch',
      expected: PROTOCOL_VERSION,
      got: 99,
    });
  });
  it('reports malformed hellos', () => {
    expect(checkHello({ type: 'hello' })).toEqual({ ok: false, error: 'bad_message' });
  });

  it('requires lobbyState.phase and defaults controlMode and teamIds', () => {
    const base = { type: 'lobbyState', roomCode: 'ABCD', hostId: null, settings, players: [] };
    expect(() => parseServerMessage(base)).toThrow();
    expect(() => parseServerMessage({ ...base, phase: 'other' })).toThrow();
    const m = parseServerMessage({
      ...base,
      phase: 'match',
      players: [
        {
          id: 'p',
          name: 'n',
          role: 'controller',
          teamId: null,
          colour: null,
          ready: false,
          connected: true,
        },
      ],
    });
    if (m.type !== 'lobbyState') throw new Error('type');
    expect(m.phase).toBe('match');
    expect(m.settings.controlMode).toBe('perPlayer');
    expect(m.players[0]?.teamIds).toEqual([]);
    expect(() =>
      parseServerMessage({ ...base, phase: 'lobby', settings: { ...settings, controlMode: 'x' } }),
    ).toThrow();
  });

  it('carries activePlayerId on turnStart and accepts toggleTeam', () => {
    const t = { type: 'turnStart', teamId: 'a', snailId: 's', durationMs: 1, activePlayerId: 'p' };
    expect(parseServerMessage(t)).toEqual(t);
    expect(parseServerMessage({ ...t, activePlayerId: undefined }).type).toBe('turnStart');
    expect(parseClientMessage({ type: 'toggleTeam', teamId: 'A' }).type).toBe('toggleTeam');
  });
});
