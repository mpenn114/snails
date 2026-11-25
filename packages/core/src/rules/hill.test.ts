import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../sim/events.js';
import { createMatch } from '../sim/match.js';
import { testMatchOptions } from '../sim/test-match.js';
import type { GameState } from '../state/types.js';
import { HILL_SOLO_BONUS, HILL_TARGET, evaluateHill, scoreHill } from './hill.js';

function hillMatch(seed = 21) {
  const base = testMatchOptions(seed);
  return createMatch({
    ...base,
    turn: { introDuration: 0.5, retreatDuration: 0.5 },
    settings: { mode: 'kingOfTheHill', crates: 'off', wind: 'off', suddenDeathRound: null },
  });
}

function moveInto(state: GameState, teamIndex: number, count: number): void {
  const hill = state.hill!;
  state.teams[teamIndex]!.snails.slice(0, count).forEach((s) => {
    s.position = { ...hill.position };
  });
}

describe('King of the Hill', () => {
  it('places a zone on dry ground deterministically from the seed', () => {
    const a = hillMatch().sim.state.hill!;
    const b = hillMatch().sim.state.hill!;
    expect(a).toEqual(b);
    expect(a.position.y).toBeGreaterThan(hillMatch().sim.state.terrain.waterLevel);
    expect(a.target).toBe(HILL_TARGET);
    expect(Object.values(a.scores).every((n) => n === 0)).toBe(true);
    expect(hillMatch(22).sim.state.hill!.position).not.toEqual(a.position);
  });

  it('is absent in other modes', () => {
    const { sim } = createMatch(testMatchOptions(21));
    expect(sim.state.hill).toBeUndefined();
  });

  it('scores one per snail plus the solo bonus, and nothing outside', () => {
    const { sim } = hillMatch();
    const s = sim.state;
    const events: SimEvent[] = [];
    const id = s.teams[0]!.id;
    scoreHill(s, id, (e) => events.push(e));
    expect(events).toEqual([]);
    moveInto(s, 0, 2);
    scoreHill(s, id, (e) => events.push(e));
    expect(events).toEqual([
      { type: 'hillScored', teamId: id, points: 2 + HILL_SOLO_BONUS, total: 4 },
    ]);
    moveInto(s, 1, 1);
    scoreHill(s, id, (e) => events.push(e));
    expect(s.hill!.scores[id]).toBe(6);
  });

  it('wins at the target score when the turn ends', () => {
    const { sim } = hillMatch();
    const s = sim.state;
    const id = s.turn.activeTeamId!;
    moveInto(
      s,
      s.teams.findIndex((t) => t.id === id),
      1,
    );
    s.hill!.scores[id] = HILL_TARGET - 3;
    expect(evaluateHill(s).status).toBe('playing');
    const events: SimEvent[] = [];
    for (let i = 0; i < 20_000 && s.match.status === 'playing'; i++) {
      if (s.turn.phase === 'action') sim.enqueue({ type: 'endTurn', teamId: id });
      events.push(...sim.step());
    }
    expect(s.match).toEqual({ status: 'won', winnerTeamId: id, reason: 'hill' });
    expect(events.some((e) => e.type === 'matchEnded' && e.reason === 'hill')).toBe(true);
  });

  it('relocates every third round, deterministically, and survives a snapshot round-trip', () => {
    const run = (): { moves: SimEvent[]; json: string } => {
      const { sim } = hillMatch();
      const moves: SimEvent[] = [];
      for (let i = 0; i < 100_000 && sim.state.turn.turnNumber <= 9; i++) {
        if (sim.state.turn.phase === 'action') {
          sim.enqueue({ type: 'endTurn', teamId: sim.state.turn.activeTeamId! });
        }
        moves.push(...sim.step().filter((e) => e.type === 'hillMoved'));
      }
      return { moves, json: JSON.stringify(sim.snapshot()) };
    };
    const a = run();
    expect(a.moves.length).toBeGreaterThanOrEqual(1);
    expect(run().moves).toEqual(a.moves);
    const back = JSON.parse(a.json) as GameState;
    expect(back.hill!.position).toEqual((a.moves.at(-1) as { position: unknown }).position);
  });
});
