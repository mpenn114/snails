import { describe, expect, it } from 'vitest';
import { createCpuPlayer, type CpuPlayer } from '@snails/ai';
import { GameSession, type SessionTeam, type TurnStartInfo } from './game-session.js';

const settings = {
  turnTimeSeconds: 10,
  snailsPerTeam: 4,
  seed: 7,
  controlMode: 'perPlayer' as const,
};

function cpu(seed: number): CpuPlayer {
  return createCpuPlayer({ difficulty: 'rookie', personality: 'aggressive', seed });
}

interface Log {
  turns: TurnStartInfo[];
  events: string[];
  ended: boolean;
}

function run(
  teams: SessionTeam[],
  cpus: Map<string, CpuPlayer>,
  poll: (s: GameSession) => void,
  maxTurns: number,
): Log {
  const log: Log = { turns: [], events: [], ended: false };
  const s = new GameSession({
    settings,
    teams,
    cpuPlayers: cpus,
    cpuThinkMs: 0,
    onEvents: (b) => b.events.forEach((e) => log.events.push(e.type)),
    onTurnStart: (t) => log.turns.push(t),
    onMatchEnd: () => (log.ended = true),
  });
  for (let i = 0; i < 6000 && !log.ended && log.turns.length < maxTurns; i++) {
    s.advance(100);
    poll(s);
  }
  return log;
}

describe('CPU teams in a session', () => {
  it('plays its turn (fires) and hands the turn back to the human', () => {
    const teams: SessionTeam[] = [
      { id: 'human', name: 'Human', colour: '#f00', playerIds: ['p1'] },
      { id: 'cpu-1', name: 'CPU Rookie', colour: '#00f', playerIds: [] },
    ];
    const blocked: string[] = [];
    const log = run(
      teams,
      new Map([['cpu-1', cpu(8)]]),
      (s) => {
        // The human ends their own turn at once; on the CPU's turn they cannot command.
        const r = s.applyIntent('p1', { type: 'endTurn' });
        if (s.activeTeamId === 'cpu-1') blocked.push(r.ok ? 'ok' : r.reason);
      },
      5,
    );
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked).not.toContain('ok');
    expect(blocked).toContain('not_your_turn');
    const order = log.turns.map((t) => t.teamId);
    expect(order[0]).toBe('human');
    expect(order).toContain('cpu-1');
    expect(log.turns.filter((t) => t.teamId === 'cpu-1').every((t) => !t.activePlayerId)).toBe(
      true,
    );
    expect(log.events).toContain('projectileFired');
    expect(log.events).toContain('explosion');
    expect(order.slice(order.indexOf('cpu-1') + 1)).toContain('human');
  });

  it('ends the turn when the CPU plan throws', () => {
    const broken: CpuPlayer = {
      config: { difficulty: 'rookie', personality: 'cautious', seed: 1 },
      planTurn: () => {
        throw new Error('boom');
      },
      planResearch: () => {
        throw new Error('boom');
      },
    };
    const teams: SessionTeam[] = [
      { id: 'cpu-1', name: 'A', colour: '#f00', playerIds: [] },
      { id: 'human', name: 'H', colour: '#00f', playerIds: ['p1'] },
    ];
    const log = run(teams, new Map([['cpu-1', broken]]), () => {}, 3);
    expect(log.turns.map((t) => t.teamId).slice(0, 2)).toEqual(['cpu-1', 'human']);
  });

  it('runs a CPU-vs-CPU match without errors until it ends or the turn cap', () => {
    const teams: SessionTeam[] = [
      { id: 'cpu-1', name: 'CPU A', colour: '#f00', playerIds: [] },
      { id: 'cpu-2', name: 'CPU B', colour: '#00f', playerIds: [] },
    ];
    const log = run(
      teams,
      new Map([
        ['cpu-1', cpu(8)],
        ['cpu-2', cpu(9)],
      ]),
      () => {},
      30,
    );
    expect(log.turns.length >= 10 || log.ended).toBe(true);
    expect(log.events).toContain('projectileFired');
    expect(log.turns.every((t) => t.activePlayerId === undefined)).toBe(true);
  });
});
