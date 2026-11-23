import { describe, expect, it } from 'vitest';
import type { LobbyPlayer } from '@snails/protocol';
import { buildJoinUrl, fetchInfo, groupByTeam, readyCount, settingsSummary } from './lobby-logic';

const p = (id: string, teamId: string | null, ready = false, role = 'controller'): LobbyPlayer =>
  ({ id, name: id, role, teamId, colour: null, ready, connected: true }) as LobbyPlayer;

describe('display lobby logic', () => {
  it('builds the join url', () => {
    expect(buildJoinUrl('http://1.2.3.4:3000/', 'ABCD')).toBe('http://1.2.3.4:3000/?room=ABCD');
  });

  it('groups by team with unassigned last and ignores displays', () => {
    const groups = groupByTeam([
      p('a', null),
      p('b', 'B'),
      p('c', 'A'),
      p('d', 'A'),
      p('x', 'A', false, 'display'),
    ]);
    expect(groups.map((g) => [g.teamId, g.players.map((q) => q.id)])).toEqual([
      ['A', ['c', 'd']],
      ['B', ['b']],
      [null, ['a']],
    ]);
  });

  it('summarises settings and ready counts', () => {
    expect(
      settingsSummary({ turnTimeSeconds: 30, snailsPerTeam: 3, seed: 1, controlMode: 'perPlayer' }),
    ).toContain('30s');
    expect(readyCount([p('a', 'A', true), p('b', 'B'), p('d', null, true, 'display')])).toEqual({
      ready: 1,
      total: 2,
    });
  });

  it('fetches info and tolerates failures', async () => {
    const ok = async () => ({
      ok: true,
      json: async () => ({ joinUrl: 'http://h:1/', primaryIp: 'h', port: 1 }),
    });
    expect(await fetchInfo(ok)).toEqual({ joinUrl: 'http://h:1/', primaryIp: 'h', port: 1 });
    expect(await fetchInfo(async () => ({ ok: false, json: async () => ({}) }))).toBeUndefined();
    expect(await fetchInfo(async () => ({ ok: true, json: async () => ({}) }))).toBeUndefined();
    expect(await fetchInfo(async () => Promise.reject(new Error('x')))).toBeUndefined();
  });
});
