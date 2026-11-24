import { describe, expect, it } from 'vitest';
import type { LobbyPlayer } from '@snails/protocol';
import {
  PALETTE,
  canStart,
  lobbyErrorText,
  parseIntField,
  randomSeed,
  settingsError,
  startBlocker,
  takenColours,
} from './lobby-logic';

const p = (id: string, teamId: string | null, ready: boolean, colour: string | null = null) =>
  ({
    id,
    name: id,
    role: 'controller',
    teamId,
    colour,
    ready,
    connected: true,
    teamIds: teamId ? [teamId] : [],
  }) as LobbyPlayer;
const ok = { turnTimeSeconds: 30, snailsPerTeam: 3, seed: 1, controlMode: 'perPlayer' as const };

describe('controller lobby logic', () => {
  it('hot-seat lets one phone cover several teams, perPlayer does not', () => {
    const multi = { ...p('a', 'A', true), teamIds: ['A', 'B'] } as LobbyPlayer;
    expect(startBlocker([multi], 'hotSeat')).toBeUndefined();
    expect(startBlocker([multi], 'perPlayer')).toMatch(/only one team/);
    expect(canStart([multi], 'a', 'a', { ...ok, controlMode: 'hotSeat' })).toBe(true);
    expect(canStart([multi], 'a', 'a', ok)).toBe(false);
  });

  it('finds taken colours excluding mine, case-insensitively', () => {
    const t = takenColours(
      [p('a', 'A', false, PALETTE[0]?.toUpperCase() as string), p('b', 'B', false, PALETTE[1])],
      'b',
    );
    expect([...t]).toEqual([PALETTE[0]]);
  });

  it('mirrors server start rules', () => {
    expect(startBlocker([p('a', null, false)])).toMatch(/team/);
    expect(startBlocker([p('a', 'A', false), p('b', 'B', true)])).toMatch(/ready/);
    expect(startBlocker([p('a', 'A', true), p('b', 'A', true)])).toMatch(/two teams/);
    expect(startBlocker([p('a', 'A', true), p('b', 'B', true)])).toBeUndefined();
  });

  it('enables start only for the host with valid settings', () => {
    const ready = [p('a', 'A', true), p('b', 'B', true)];
    expect(canStart(ready, 'a', 'a', ok)).toBe(true);
    expect(canStart(ready, 'a', 'b', ok)).toBe(false);
    expect(canStart(ready, 'a', 'a', { ...ok, turnTimeSeconds: 5 })).toBe(false);
  });

  it('validates settings ranges', () => {
    expect(settingsError(ok)).toBeUndefined();
    expect(settingsError({ ...ok, turnTimeSeconds: 121 })).toMatch(/Turn time/);
    expect(settingsError({ ...ok, snailsPerTeam: 0 })).toMatch(/Snails/);
    expect(settingsError({ ...ok, snailsPerTeam: Number.NaN })).toMatch(/Snails/);
    expect(settingsError({ ...ok, seed: -1 })).toMatch(/Seed/);
  });

  it('parses fields, seeds and errors', () => {
    expect(parseIntField(' 42 ')).toBe(42);
    expect(parseIntField('')).toBeNaN();
    expect(parseIntField('1.5')).toBeNaN();
    expect(randomSeed(() => 0.5)).toBe(0x80000000);
    expect(lobbyErrorText('not_host', 'x')).toMatch(/host/);
    expect(lobbyErrorText('invalid_settings', 'Colour already taken')).toBe('Colour already taken');
    expect(lobbyErrorText('not_in_lobby', '')).toMatch(/started/);
    expect(lobbyErrorText('internal', '')).toMatch(/wrong/);
  });
});
