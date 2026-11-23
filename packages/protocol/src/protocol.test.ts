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
    expect(() =>
      parseClientMessage({ type: 'startMatch', settings: { ...settings, snailsPerTeam: 0 } }),
    ).toThrow();
  });
});

describe('server messages', () => {
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
});
