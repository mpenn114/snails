import { teamStat } from '../research/tech-effects.js';
import type { GameState, MatchStatus, Snail, Team, TurnPhase } from '../state/types.js';
import type { SimEvent } from '../sim/events.js';
import type { SimContext } from '../sim/types.js';
import { rollWind, type WindConfig, DEFAULT_WIND_CONFIG } from '../sim/wind.js';
import type { Rng } from '../rng.js';
import {
  evaluateMatch,
  evaluateResearchRace,
  evaluateTurnLimit,
  resolveDraw,
} from '../rules/win.js';

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
  /** Turn cap: once this many turns have ended, the match is decided by total health. Undefined = unlimited. */
  maxTurns?: number;
  /** Lazy start: the action timer only runs after the turn's first input (default off). */
  lazyStart?: boolean;
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
 * Picks the next team's snail to act, and advances that team's round-robin cursor.
 *
 * Teams rotate in `state.teams` order, starting after `state.turn.activeTeamId` and wrapping;
 * teams with no living snail are skipped. Within the chosen team, the snail at
 * `team.nextSnailIndex` (or the next living one after it, wrapping) acts, and the cursor moves
 * just past it, so each team cycles its own snails independently of the others.
 *
 * With no active team (first turn) the scan starts at team 0. If only one team has living
 * snails, that team is returned again. Returns null when no team has a living snail (the win
 * condition is handled elsewhere, M1-20). Mutates only the chosen team's `nextSnailIndex`.
 */
export function selectNextActive(state: GameState): { teamId: string; snailId: string } | null {
  const teams = state.teams;
  const cur = teams.findIndex((t) => t.id === state.turn.activeTeamId);
  for (let i = 1; i <= teams.length; i++) {
    const team = teams[(cur + i + teams.length) % teams.length];
    const snail = team ? takeNextLivingSnail(team) : undefined;
    if (team && snail) return { teamId: team.id, snailId: snail.id };
  }
  return null;
}

/** Returns the next living snail of `team` from its cursor, advancing the cursor past it. */
function takeNextLivingSnail(team: Team): Snail | undefined {
  const n = team.snails.length;
  for (let j = 0; j < n; j++) {
    const idx = (team.nextSnailIndex + j) % n;
    const snail = team.snails[idx];
    if (snail?.alive) {
      team.nextSnailIndex = (idx + 1) % n;
      return snail;
    }
  }
  return undefined;
}

/** Changes phase, resetting the phase timer, and emits `phaseChanged`. */
export function setPhase(state: GameState, to: TurnPhase, emit: Emit): void {
  const from = state.turn.phase;
  state.turn.phase = to;
  state.turn.phaseTime = 0;
  emit({ type: 'phaseChanged', from, to });
}

/** Seeded wind source for turns: the wind RNG stream and the wind rules. */
export interface TurnWind {
  rng: Rng;
  config: WindConfig;
}

/**
 * Begins the current turn in the intro phase (call once for the first turn). When `wind` is
 * given, the wind is rolled for this turn first and `windChanged` is emitted.
 */
export function startTurn(state: GameState, config: TurnConfig, emit: Emit, wind?: TurnWind): void {
  if (wind) {
    state.wind = rollWind(state.wind, wind.rng, wind.config);
    emit({ type: 'windChanged', strength: state.wind.strength, direction: state.wind.direction });
  }
  const t = state.turn;
  t.phase = 'intro';
  t.phaseTime = 0;
  t.fired = false;
  delete t.uses;
  delete t.inputStarted;
  delete t.damageDealt;
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

/**
 * Ends the turn early from action. After a shot this goes to retreat (the snail may pull into
 * its shell); before any shot it goes straight to settle. No-op outside action.
 */
export function requestEndTurn(state: GameState, emit: Emit = () => undefined): void {
  if (state.turn.phase !== 'action') return;
  setPhase(state, state.turn.fired ? 'retreat' : 'settle', emit);
}

function allAtRest(state: GameState, eps: number): boolean {
  return (
    state.teams.every((t) =>
      t.snails.every((s) => {
        const v = s.velocity;
        return !s.alive || Math.hypot(v.x, v.y, v.z) < eps;
      }),
    ) && state.crates.every((c) => c.grounded)
  );
}

/** Ends the match: records the outcome on `state.match` and emits `matchEnded`. */
function endMatch(state: GameState, status: MatchStatus, emit: Emit): void {
  state.match = status;
  const { winnerTeamId, reason } = status;
  emit({
    type: 'matchEnded',
    status: status.status,
    ...(winnerTeamId === null ? {} : { winnerTeamId }),
    ...(reason ? { reason } : {}),
  });
}

function endTurn(state: GameState, config: TurnConfig, emit: Emit, wind?: TurnWind): void {
  emit({ type: 'turnEnded', teamId: state.turn.activeTeamId, turnNumber: state.turn.turnNumber });
  const elimination = resolveDraw(state, evaluateMatch(state));
  const outcome =
    elimination.status === 'playing' ? evaluateTurnLimit(state, config.maxTurns) : elimination;
  if (outcome.status !== 'playing') {
    endMatch(state, outcome, emit);
    return;
  }
  const next = selectNextActive(state);
  if (!next) return;
  state.turn.activeTeamId = next.teamId;
  state.turn.activeSnailId = next.snailId;
  state.turn.turnNumber += 1;
  emit({ type: 'phaseChanged', from: state.turn.phase, to: 'intro' });
  startTurn(state, config, emit, wind);
}

/**
 * Advances the turn state machine by `dt` seconds. `wind`, if given, is rolled at each new turn.
 */
export function advanceTurn(
  state: GameState,
  config: TurnConfig,
  dt: number,
  emit: Emit,
  wind?: TurnWind,
  retreatBonus?: number,
): void {
  if (state.match.status !== 'playing') return;
  const race = evaluateResearchRace(state);
  if (race.status !== 'playing') {
    endMatch(state, race, emit);
    return;
  }
  const t = state.turn;
  t.phaseTime += dt;
  switch (t.phase) {
    case 'intro':
      if (t.phaseTime >= config.introDuration) setPhase(state, 'action', emit);
      break;
    case 'action':
      if (config.lazyStart === true && t.inputStarted !== true) break;
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
      if (t.phaseTime >= config.retreatDuration + (retreatBonus ?? 0))
        setPhase(state, 'settle', emit);
      break;
    case 'settle':
      if (allAtRest(state, config.restEpsilon) || t.phaseTime >= config.settleTimeout) {
        endTurn(state, config, emit, wind);
      }
      break;
  }
}

/**
 * Creates a system for `Simulation.addSystem` driving the turn phases. Wind is rolled from the
 * simulation's wind stream at each new turn using `windConfig`.
 */
export function turnSystem(
  config: TurnConfig = DEFAULT_TURN_CONFIG,
  windConfig: WindConfig = DEFAULT_WIND_CONFIG,
): (ctx: SimContext) => void {
  return (ctx) => {
    const team = ctx.state.turn.activeTeamId;
    const bonus =
      team === null
        ? 0
        : teamStat(ctx.state, ctx.techs, team, 'moveBudgetSeconds', config.retreatDuration) -
          config.retreatDuration;
    advanceTurn(
      ctx.state,
      config,
      ctx.dt,
      ctx.emit,
      { rng: ctx.rng.wind, config: windConfig },
      bonus,
    );
  };
}
