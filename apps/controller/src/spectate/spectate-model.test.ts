import { describe, expect, it } from 'vitest';
import type { ServerMessage, SimEventData } from '@snails/protocol';
import { encodeEventBatch } from '@snails/protocol';
import { deriveView, initialSpectate, reduceSpectate, turnsUntilMine } from './spectate-model';
import type { SpectateState } from './spectate-model';

const lobby = (teamId: string | null, phase: 'lobby' | 'match' = 'lobby'): ServerMessage =>
  ({
    type: 'lobbyState',
    phase,
    roomCode: 'ABCD',
    hostId: 'p1',
    players: [
      {
        id: 'p1',
        name: 'A',
        role: 'controller',
        teamId,
        colour: null,
        ready: true,
        connected: true,
      },
    ],
    settings: { turnTimeSeconds: 30, snailsPerTeam: 2, seed: 1 },
  }) as unknown as ServerMessage;

const started = {
  type: 'matchStarted',
  seed: 1,
  terrain: {},
  settings: {},
  teams: ['red', 'blue', 'green'].map((id) => ({
    id,
    name: id.toUpperCase(),
    colour: `#${id}`,
    snails: [
      { id: `${id}1`, name: `${id}-a` },
      { id: `${id}2`, name: `${id}-b` },
    ],
  })),
} as unknown as ServerMessage;

const turn = (teamId: string, snailId: string): ServerMessage => ({
  type: 'turnStart',
  teamId,
  snailId,
  durationMs: 30000,
});

const events = (...e: SimEventData[]): ServerMessage => encodeEventBatch(1, e) as ServerMessage;

function run(...msgs: ServerMessage[]): SpectateState {
  return msgs.reduce(reduceSpectate, initialSpectate('p1'));
}

describe('spectate model', () => {
  it('is hidden before a turn starts', () => {
    expect(deriveView(run(lobby('blue'), started)).kind).toBe('hidden');
  });

  it('shows the waiting banner with hint', () => {
    const v = deriveView(run(lobby('blue'), started, turn('red', 'red1')));
    expect(v.kind).toBe('waiting');
    expect(v.title).toBe("RED's turn — red-a");
    expect(v.colour).toBe('#red');
    expect(v.hint).toBe('Your turn next');
    expect(v.mySnails.map((x) => x.id)).toEqual(['blue1', 'blue2']);
  });

  it('counts turns ahead and skips dead teams', () => {
    let s = run(lobby('green'), started, turn('red', 'red1'));
    expect(turnsUntilMine(s)).toBe(2);
    expect(deriveView(s).hint).toBe('Your turn in 2 turns');
    s = reduceSpectate(
      s,
      events(
        { type: 'snailDied', snailId: 'blue1', teamId: 'blue', cause: 'fall' },
        { type: 'snailDied', snailId: 'blue2', teamId: 'blue', cause: 'fall' },
      ),
    );
    expect(turnsUntilMine(s)).toBe(1);
  });

  it('flashes only on my turn and updates health from events', () => {
    let s = run(lobby('red'), started, turn('red', 'red1'));
    expect(s.flashSeq).toBe(1);
    expect(deriveView(s).kind).toBe('myTurn');
    s = reduceSpectate(s, turn('blue', 'blue1'));
    expect(s.flashSeq).toBe(1);
    s = reduceSpectate(
      s,
      events({
        type: 'snailDamaged',
        snailId: 'red1',
        amount: 10,
        remaining: 40,
        sourceSnailId: null,
        cause: 'fall',
      }),
    );
    expect(deriveView(s).mySnails[0]?.hp).toBe(40);
  });

  it('ends the match and returns to lobby when lobby resumes', () => {
    let s = run(lobby('red'), started, turn('red', 'red1'));
    s = reduceSpectate(s, events({ type: 'matchEnded', status: 'won', winnerTeamId: 'red' }));
    expect(deriveView(s)).toMatchObject({ kind: 'ended', title: 'Victory!' });
    s = reduceSpectate(s, lobby('red'));
    expect(s.phase).toBe('lobby');
    expect(deriveView(s).kind).toBe('hidden');
  });

  it('keeps the end screen on mid-match roster updates until the lobby resumes', () => {
    let s = run(lobby('red'), started, events({ type: 'matchEnded', status: 'draw' }));
    s = reduceSpectate(s, lobby('red', 'match'));
    expect(s.phase).toBe('ended');
    s = reduceSpectate(s, lobby('red'));
    expect(s.phase).toBe('lobby');
  });

  it('reports other winners and draws', () => {
    const won = run(
      lobby('red'),
      started,
      events({ type: 'matchEnded', status: 'won', winnerTeamId: 'blue' }),
    );
    expect(deriveView(won).title).toBe('BLUE wins');
    const draw = run(lobby('red'), started, events({ type: 'matchEnded', status: 'draw' }));
    expect(deriveView(draw).title).toBe('Draw!');
  });
});
