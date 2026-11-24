import { describe, expect, it } from 'vitest';
import type { Member } from '../rooms/room.js';
import { buildTeams, TEAM_COLOUR_PALETTE } from './match-runner.js';

function member(id: string, teamIds: string[], colour: string | null): Member {
  return {
    id,
    token: id,
    name: id,
    role: 'controller',
    teamId: teamIds[0] ?? null,
    teamIds,
    colour,
    ready: true,
    connected: true,
    send: () => {},
  };
}

describe('buildTeams colours', () => {
  it('gives each hot-seat team of one phone a distinct palette colour', () => {
    const teams = buildTeams([member('p1', ['t1', 't2', 't3'], '#1a46c8')]);
    const colours = teams.map((t) => t.colour.toLowerCase());
    expect(new Set(colours).size).toBe(3);
    expect(colours[0]).toBe('#1a46c8');
    for (const c of colours) expect(TEAM_COLOUR_PALETTE).toContain(c);
  });

  it('does not steal a colour another player chose', () => {
    const teams = buildTeams([
      member('p1', ['t1', 't2'], null),
      member('p2', ['t3'], TEAM_COLOUR_PALETTE[0] ?? null),
    ]);
    const colours = teams.map((t) => t.colour.toLowerCase());
    expect(new Set(colours).size).toBe(3);
    expect(teams.find((t) => t.id === 't3')?.colour).toBe(TEAM_COLOUR_PALETTE[0]);
  });
});
