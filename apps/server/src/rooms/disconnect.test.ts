import { describe, expect, it } from 'vitest';
import { RoomManager, type Member } from './room-manager.js';

function timers() {
  const pending: { fn: () => void; ms: number; live: boolean }[] = [];
  return {
    pending,
    t: {
      set: (fn: () => void, ms: number): unknown => pending.push({ fn, ms, live: true }) - 1,
      clear: (h: unknown): void => void (pending[h as number]!.live = false),
    },
  };
}

const join = (m: RoomManager, code: string, name: string): Member => {
  const r = m.join(code, name, 'controller', () => {});
  if (!r.ok) throw new Error(r.code);
  return r.member;
};

describe('disconnect and resume', () => {
  it('keeps a disconnected member, drops it after the lobby grace, then moves the host', () => {
    const { pending, t } = timers();
    const m = new RoomManager({ timers: t });
    const room = m.createRoom();
    const host = join(m, room.code, 'A');
    const b = join(m, room.code, 'B');
    m.disconnect(room.code, host.token);
    expect(host.connected).toBe(false);
    expect(room.hostId).toBe(host.id);
    const state = room.lobbyState() as { players: { connected: boolean }[] };
    expect(state.players.map((p) => p.connected)).toEqual([false, true]);
    expect(pending[0]?.ms).toBe(60_000);
    pending[0]!.fn();
    expect(room.members.has(host.token)).toBe(false);
    expect(room.hostId).toBe(b.id);
  });

  it('holds slots longer during a match and cancels the drop on resume', () => {
    const { pending, t } = timers();
    const m = new RoomManager({ timers: t });
    const room = m.createRoom();
    const a = join(m, room.code, 'A');
    room.phase = 'playing';
    m.disconnect(room.code, a.token);
    expect(pending[0]?.ms).toBe(120_000);
    const res = m.join(room.code, 'A', 'controller', () => {}, { sessionToken: a.token });
    expect(res.ok).toBe(true);
    expect(pending[0]?.live).toBe(false);
    const bad = m.join(room.code, 'A', 'controller', () => {}, { sessionToken: 'x' });
    expect(bad).toEqual({ ok: false, code: 'bad_session' });
  });

  it('ignores a disconnect from a superseded connection', () => {
    const m = new RoomManager();
    const room = m.createRoom();
    const old = (): void => {};
    const r = m.join(room.code, 'A', 'controller', () => {}, { detach: old });
    if (!r.ok) throw new Error('join');
    m.join(room.code, 'A', 'controller', () => {}, {
      sessionToken: r.member.token,
      detach: () => {},
    });
    m.disconnect(room.code, r.member.token, old);
    expect(r.member.connected).toBe(true);
    m.dispose();
  });
});
