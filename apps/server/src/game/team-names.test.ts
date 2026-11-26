import { describe, expect, it } from 'vitest';
import type { Member } from '../rooms/room.js';
import { GameSession } from './game-session.js';
import { buildTeams } from './match-runner.js';

const member = (over: Partial<Member>): Member => ({
  id: 'p1',
  token: 'p1',
  name: 'Ann',
  role: 'controller',
  teamId: 'A',
  teamIds: ['A'],
  colour: null,
  ready: true,
  connected: true,
  send: () => {},
  ...over,
});

describe('team and snail names', () => {
  it('uses the phone team name and snail names; extra hot-seat teams get derived names', () => {
    const teams = buildTeams([
      member({ teamIds: ['A', 'B'], teamName: 'Slime Squad', snailNames: ['Gary', 'Turbo'] }),
    ]);
    expect(teams[0]).toMatchObject({ id: 'A', name: 'Slime Squad', snailNames: ['Gary', 'Turbo'] });
    expect(teams[1]?.name).toBe('Slime Squad B');
    expect(teams[1]?.snailNames).toBeUndefined();
  });

  it('falls back to the team id for a member without a name', () => {
    expect(buildTeams([member({})])[0]?.name).toBe('A');
  });

  it('puts the custom snail names into the match, padding missing ones with defaults', () => {
    const s = new GameSession({
      settings: { turnTimeSeconds: 10, snailsPerTeam: 3, seed: 1 },
      teams: [
        {
          id: 'a',
          name: 'Slime Squad',
          colour: '#f00',
          playerIds: ['a1'],
          snailNames: ['Gary', ''],
        },
        { id: 'b', name: 'Goo Crew', colour: '#00f', playerIds: ['b1'] },
      ],
    });
    const teams = s.matchStartedMessage().teams;
    expect(teams[0]?.snails.map((x) => x.name).slice(0, 1)).toEqual(['Gary']);
    expect(teams[0]?.snails).toHaveLength(3);
    const all = teams.flatMap((t) => t.snails.map((x) => x.name));
    expect(all.every(Boolean)).toBe(true);
    expect(new Set(all).size).toBe(all.length);
  });
});
