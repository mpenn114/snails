import { describe, expect, it } from 'vitest';
import { backoffDelay, buildWsUrl } from './url';
import { clearSession, loadSession, saveSession } from './session-store';
import type { StorageLike } from './session-store';

function memStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('url and backoff', () => {
  it('builds ws and wss urls', () => {
    expect(buildWsUrl({ protocol: 'http:', host: '192.168.1.5:3000' })).toBe(
      'ws://192.168.1.5:3000/ws',
    );
    expect(buildWsUrl({ protocol: 'https:', host: 'a.b' })).toBe('wss://a.b/ws');
  });
  it('grows exponentially, caps at 5 s and jitters', () => {
    expect(backoffDelay(0, 1)).toBe(250);
    expect(backoffDelay(0, 0)).toBe(125);
    expect(backoffDelay(2, 1)).toBe(1000);
    expect(backoffDelay(20, 1)).toBe(5000);
    expect(backoffDelay(20, 0)).toBe(2500);
  });
});

describe('session store', () => {
  it('round-trips, tolerates corruption and absence', () => {
    const st = memStorage();
    expect(loadSession(st)).toBeUndefined();
    saveSession(st, { name: 'A', roomCode: 'ABCD', sessionToken: 't' });
    expect(loadSession(st)).toEqual({ name: 'A', roomCode: 'ABCD', sessionToken: 't' });
    st.setItem('snails.session', '{bad');
    expect(loadSession(st)).toBeUndefined();
    st.setItem('snails.session', '{"name":1}');
    expect(loadSession(st)).toBeUndefined();
    clearSession(st);
    expect(st.data.size).toBe(0);
    expect(loadSession(undefined)).toBeUndefined();
    saveSession(undefined, { name: 'A', roomCode: 'ABCD' });
  });
});
