import { describe, expect, it } from 'vitest';
import { GameSession, type TurnStartInfo } from './game-session.js';

const teams = [
  { id: 'a', name: 'A', colour: '#f00', playerIds: ['a1', 'a2'] },
  { id: 'b', name: 'B', colour: '#00f', playerIds: ['b1'] },
];

function make(controlMode: 'perPlayer' | 'hotSeat', starts: TurnStartInfo[]): GameSession {
  return new GameSession({
    settings: { turnTimeSeconds: 10, snailsPerTeam: 1, seed: 7, controlMode },
    teams,
    onTurnStart: (i) => starts.push(i),
  });
}

function toAction(s: GameSession): void {
  for (let i = 0; i < 100 && s.snapshot().turn[2] !== 1; i++) s.advance(100);
}

describe('GameSession control modes', () => {
  it('perPlayer rotates the commanding player each time a team comes up', () => {
    const starts: TurnStartInfo[] = [];
    const s = make('perPlayer', starts);
    for (let i = 0; i < 2000 && starts.length < 6; i++) s.advance(100);
    const a = starts.filter((t) => t.teamId === 'a').map((t) => t.activePlayerId);
    const b = starts.filter((t) => t.teamId === 'b').map((t) => t.activePlayerId);
    expect(a.slice(0, 3)).toEqual(['a1', 'a2', 'a1']);
    expect(b.every((p) => p === 'b1')).toBe(true);
  });

  it('perPlayer only accepts the designated commander', () => {
    const starts: TurnStartInfo[] = [];
    const s = make('perPlayer', starts);
    toAction(s);
    const first = starts[0] as TurnStartInfo;
    const mates = (teams.find((t) => t.id === first.teamId) as (typeof teams)[number]).playerIds;
    const active = first.activePlayerId as string;
    const mate = mates.find((p) => p !== active);
    expect(s.applyIntent(active, { type: 'jump' }).ok).toBe(true);
    if (mate)
      expect(s.applyIntent(mate, { type: 'jump' })).toMatchObject({ reason: 'not_your_turn' });
    const other = first.teamId === 'a' ? 'b1' : 'a1';
    expect(s.applyIntent(other, { type: 'jump' })).toMatchObject({ reason: 'not_your_turn' });
  });

  it('hotSeat accepts any controller bound to the active team', () => {
    const starts: TurnStartInfo[] = [];
    const s = make('hotSeat', starts);
    toAction(s);
    const first = starts[0] as TurnStartInfo;
    const bound = first.teamId === 'a' ? ['a1', 'a2'] : ['b1'];
    for (const p of bound) expect(s.applyIntent(p, { type: 'jump' }).ok).toBe(true);
    const other = first.teamId === 'a' ? 'b1' : 'a1';
    expect(s.applyIntent(other, { type: 'jump' })).toMatchObject({ reason: 'not_your_turn' });
  });

  it('skips disconnected teammates when rotating', () => {
    const starts: TurnStartInfo[] = [];
    const s = new GameSession({
      settings: { turnTimeSeconds: 10, snailsPerTeam: 1, seed: 7, controlMode: 'perPlayer' },
      teams,
      isConnected: (id) => id !== 'a1',
      onTurnStart: (i) => starts.push(i),
    });
    for (let i = 0; i < 2000 && starts.length < 4; i++) s.advance(100);
    const a = starts.filter((t) => t.teamId === 'a').map((t) => t.activePlayerId);
    expect(a.every((p) => p === 'a2')).toBe(true);
  });
});
