import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@snails/protocol';
import { MAX_CONTROLLERS, RoomManager, type Timers } from './room-manager.js';

function fakeTimers(): Timers & { fire(): void; pending: number } {
  const fns = new Map<number, () => void>();
  let n = 0;
  return {
    set: (fn) => {
      fns.set(++n, fn);
      return n;
    },
    clear: (h) => void fns.delete(h as number),
    fire: () => [...fns.values()].forEach((f) => f()),
    get pending() {
      return fns.size;
    },
  };
}

function setup(timers: Timers = fakeTimers()) {
  const m = new RoomManager({ timers });
  const room = m.createRoom();
  const inbox = new Map<string, ServerMessage[]>();
  const add = (name: string, role: 'controller' | 'display' = 'controller') => {
    const log: ServerMessage[] = [];
    const r = m.join(room.code.toLowerCase(), name, role, (x) => log.push(x));
    if (!r.ok) throw new Error(r.code);
    inbox.set(name, log);
    return r.member;
  };
  return { m, room, add, inbox };
}

describe('RoomManager', () => {
  it('creates unique codes from the alphabet, case-insensitive lookup', () => {
    const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const m = new RoomManager({ random: () => seq[i++] ?? 0.9 });
    const a = m.createRoom();
    const b = m.createRoom();
    expect(a.code).toBe('AAAA');
    expect(b.code).not.toBe('AAAA');
    expect(b.code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(m.getRoom('aaaa')).toBe(a);
  });

  it('rejects unknown rooms and enforces the controller cap', () => {
    const { m, room, add } = setup();
    expect(m.join('ZZZZ', 'x', 'display', () => {})).toEqual({ ok: false, code: 'no_room' });
    for (let i = 0; i < MAX_CONTROLLERS; i++) add(`c${i}`);
    expect(m.join(room.code, 'x', 'controller', () => {})).toEqual({
      ok: false,
      code: 'room_full',
    });
    expect(m.join(room.code, 'tv', 'display', () => {}).ok).toBe(true);
  });

  it('host is first controller and is reassigned on leave', () => {
    const { m, room, add } = setup();
    add('tv', 'display');
    const a = add('a');
    const b = add('b');
    expect(room.hostId).toBe(a.id);
    m.leave(room.code, a.token);
    expect(room.hostId).toBe(b.id);
    m.leave(room.code, b.token);
    expect(room.hostId).toBeNull();
  });

  it('tokens are random and members stored by token', () => {
    const { room, add } = setup();
    const a = add('a');
    expect(a.token).toMatch(/^[0-9a-f]{32}$/);
    expect(room.members.get(a.token)).toBe(a);
  });

  it('broadcasts lobbyState on changes and enforces unique colours', () => {
    const { room, add, inbox } = setup();
    const a = add('a');
    const b = add('b');
    room.handleLobbyAction(a, { type: 'setColour', colour: '#FF0000' });
    expect(inbox.get('b')?.at(-1)).toMatchObject({ type: 'lobbyState' });
    room.handleLobbyAction(b, { type: 'setColour', colour: '#ff0000' });
    expect(inbox.get('b')?.at(-1)).toMatchObject({ type: 'error', code: 'invalid_settings' });
    room.handleLobbyAction(b, { type: 'setReady', ready: true });
    expect(inbox.get('b')?.at(-1)).toMatchObject({ type: 'error', code: 'not_ready' });
  });

  it('startMatch requires host, readiness, two teams and valid settings', () => {
    const { room, add, inbox } = setup();
    const tv = add('tv', 'display');
    const a = add('a');
    const b = add('b');
    const settings = { turnTimeSeconds: 30, snailsPerTeam: 2, seed: 7 };
    const last = (n: string) => inbox.get(n)?.at(-1);
    let started: unknown;
    room.onMatchStart = (s) => (started = s);

    room.handleLobbyAction(tv, { type: 'setTeam', teamId: 't' });
    expect(last('tv')).toMatchObject({ code: 'bad_message' });
    room.handleLobbyAction(b, { type: 'startMatch', settings });
    expect(last('b')).toMatchObject({ code: 'not_host' });
    room.handleLobbyAction(a, { type: 'startMatch', settings });
    expect(last('a')).toMatchObject({ code: 'not_ready' });
    for (const p of [a, b]) {
      room.handleLobbyAction(p, { type: 'setTeam', teamId: 'red' });
      room.handleLobbyAction(p, { type: 'setReady', ready: true });
    }
    room.handleLobbyAction(a, { type: 'startMatch', settings });
    expect(last('a')).toMatchObject({ code: 'not_ready', message: 'Need two teams' });
    room.handleLobbyAction(b, { type: 'setTeam', teamId: 'blue' });
    room.handleLobbyAction(a, { type: 'startMatch', settings: { ...settings, seed: -1 } });
    expect(last('a')).toMatchObject({ code: 'invalid_settings' });
    for (const bad of [{ turnTimeSeconds: 9 }, { turnTimeSeconds: 121 }, { snailsPerTeam: 9 }]) {
      room.handleLobbyAction(a, { type: 'startMatch', settings: { ...settings, ...bad } });
      expect(last('a')).toMatchObject({ code: 'invalid_settings' });
    }
    expect(room.lobbyState()).toMatchObject({
      settings: { turnTimeSeconds: 30, snailsPerTeam: 3, seed: 1 },
    });
    room.handleLobbyAction(a, { type: 'startMatch', settings });
    expect(started).toEqual(settings);
    expect(room.phase).toBe('playing');
    room.handleLobbyAction(a, { type: 'startMatch', settings });
    expect(last('a')).toMatchObject({ code: 'match_in_progress' });
    room.handleLobbyAction(a, { type: 'setTeam', teamId: 'x' });
    expect(last('a')).toMatchObject({ code: 'not_in_lobby' });
    room.endMatch();
    expect(room.phase).toBe('lobby');
  });

  it('deletes an emptied room after the delay unless someone rejoins', () => {
    const timers = fakeTimers();
    const { m, room, add } = setup(timers);
    const a = add('a');
    m.leave(room.code, a.token);
    expect(timers.pending).toBe(1);
    const b = add('b');
    expect(timers.pending).toBe(0);
    m.leave(room.code, b.token);
    timers.fire();
    expect(m.getRoom(room.code)).toBeUndefined();
    expect(m.roomCount).toBe(0);
    m.dispose();
  });
});
