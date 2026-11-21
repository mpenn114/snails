import type { GameState, TurnPhase } from '../state/types.js';
import type { SimContext, SimEvent } from '../sim/types.js';

/** Durations (seconds) and thresholds for the turn state machine. */
export interface TurnConfig {
  introDuration: number;
  actionDuration: number;
  resolveDelay: number;
  retreatDuration: number;
  /** Max seconds to wait for snails to come to rest. */
  settleTimeout: number;
  /** Speed (m/s) below which a snail counts as at rest. */
  restEpsilon: number;
}

/** Default turn configuration. */
export const DEFAULT_TURN_CONFIG: TurnConfig = {
  introDuration: 2,
  actionDuration: 45,
  resolveDelay: 1,
  retreatDuration: 3,
  settleTimeout: 10,
  restEpsilon: 0.05,
};

type Emit = (event: SimEvent) => void;

/**
 * Picks the next active team/snail (simple team cycle, first living snail).
 * Replaceable by M1-15. Returns null if nobody is alive.
 */
export function selectNextActive(state: GameState): { teamId: string; snailId: string } | null {
  const teams = state.teams;
  const cur = teams.findIndex((t) => t.id === state.turn.activeTeamId);
  for (let i = 1; i <= teams.length; i++) {
    const team = teams[(cur + i + teams.length) % teams.length];
    const snail = team?.snails.find((s) => s.health > 0);
    if (team && snail) return { teamId: team.id, snailId: snail.id };
  }
  return null;
}

/** Changes phase, resetting the phase timer, and emits `phaseChanged`. */
export function setPhase(state: GameState, to: TurnPhase, emit: Emit): void {
  const from = state.turn.phase;
  state.turn.phase = to;
  state.turn.phaseTime = 0;
  emit({ type: 'phaseChanged', from, to });
}

/** Begins the current turn in the intro phase (call once for the first turn). */
export function startTurn(state: GameState, config: TurnConfig, emit: Emit): void {
  const t = state.turn;
  t.phase = 'intro';
  t.phaseTime = 0;
  t.fired = false;
  t.timeRemaining = config.actionDuration;
  emit({
    type: 'turnStarted',
    teamId: t.activeTeamId,
    snailId: t.activeSnailId,
    turnNumber: t.turnNumber,
  });
}

/** Marks that the active snail fired: action -> fire. No-op outside action. */
export function notifyFired(state: GameState, emit: Emit = () => undefined): void {
  if (state.turn.phase !== 'action') return;
  state.turn.fired = true;
  setPhase(state, 'fire', emit);
}

/** Ends the turn early: action -> settle. No-op outside action. */
export function requestEndTurn(state: GameState, emit: Emit = () => undefined): void {
  if (state.turn.phase !== 'action') return;
  setPhase(state, 'settle', emit);
}

function allAtRest(state: GameState, eps: number): boolean {
  return state.teams.every((t) =>
    t.snails.every((s) => {
      const v = s.velocity;
      return !s.alive || Math.hypot(v.x, v.y, v.z) < eps;
    }),
  );
}

function endTurn(state: GameState, config: TurnConfig, emit: Emit): void {
  emit({ type: 'turnEnded', teamId: state.turn.activeTeamId, turnNumber: state.turn.turnNumber });
  const next = selectNextActive(state);
  if (!next) return;
  state.turn.activeTeamId = next.teamId;
  state.turn.activeSnailId = next.snailId;
  state.turn.turnNumber += 1;
  emit({ type: 'phaseChanged', from: state.turn.phase, to: 'intro' });
  startTurn(state, config, emit);
}

/** Advances the turn state machine by `dt` seconds. */
export function advanceTurn(state: GameState, config: TurnConfig, dt: number, emit: Emit): void {
  const t = state.turn;
  t.phaseTime += dt;
  switch (t.phase) {
    case 'intro':
      if (t.phaseTime >= config.introDuration) setPhase(state, 'action', emit);
      break;
    case 'action':
      t.timeRemaining = Math.max(0, t.timeRemaining - dt);
      if (t.timeRemaining === 0) setPhase(state, 'settle', emit);
      break;
    case 'fire':
      if (state.projectiles.length === 0) setPhase(state, 'resolve', emit);
      break;
    case 'resolve':
      if (t.phaseTime >= config.resolveDelay) setPhase(state, 'retreat', emit);
      break;
    case 'retreat':
      if (t.phaseTime >= config.retreatDuration) setPhase(state, 'settle', emit);
      break;
    case 'settle':
      if (allAtRest(state, config.restEpsilon) || t.phaseTime >= config.settleTimeout) {
        endTurn(state, config, emit);
      }
      break;
  }
}

/** Creates a system for `Simulation.addSystem` driving the turn phases. */
export function turnSystem(config: TurnConfig = DEFAULT_TURN_CONFIG): (ctx: SimContext) => void {
  return (ctx) => advanceTurn(ctx.state, config, ctx.dt, ctx.emit);
}
