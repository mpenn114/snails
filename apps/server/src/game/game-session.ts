import {
  FIXED_DT,
  createMatch,
  DEFAULT_TERRAIN_CONFIG,
  type MatchSetup,
  type SimEvent,
  type Snail,
  type WeaponDefinition,
  type MotionSpec,
  type WeaponLaunchSpec,
  getAim,
} from '@snails/core';
import {
  encodeEventBatch,
  encodeSnapshot,
  type DecodedSnapshot,
  type EventBatch,
  type MatchSettings,
  type Snapshot,
  type TerrainParams,
  type WirePhase,
} from '@snails/protocol';
import {
  intentToCommand,
  type GameIntent,
  type IntentResult,
  type TeamControlState,
} from './intent.js';

import { loadServerContent } from './server-content.js';
import { mayCommandTurn, pickActivePlayer } from './rotation.js';

export type { GameIntent, IntentResult } from './intent.js';

/** One team of a session and the players controlling it. */
export interface SessionTeam {
  id: string;
  name: string;
  colour: string;
  playerIds: string[];
}

/** Injectable timer source. */
export interface SessionClock {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** Turn start notification payload (matches the protocol `turnStart` message). */
export interface TurnStartInfo {
  teamId: string;
  snailId: string;
  durationMs: number;
  /** Controller commanding this turn (rotates within a team). */
  activePlayerId?: string;
}

/** Output callbacks; all optional. */
export interface SessionCallbacks {
  onSnapshot?(snapshot: Snapshot): void;
  onEvents?(batch: EventBatch): void;
  onTurnStart?(info: TurnStartInfo): void;
  onTurnTimer?(remainingMs: number): void;
  onMatchEnd?(winnerTeamId: string | null): void;
}

/** Options for {@link GameSession}. */
export interface GameSessionOptions extends SessionCallbacks {
  settings: MatchSettings;
  teams: SessionTeam[];
  terrain?: Partial<TerrainParams>;
  weapons?: WeaponDefinition[];
  clock?: SessionClock;
  /** Snapshots per second (default 20). */
  snapshotHz?: number;
  /** Cap on sim steps per frame (default 8). */
  maxStepsPerFrame?: number;
  /** Presence check used when rotating the commanding player (default: everyone present). */
  isConnected?: (playerId: string) => boolean;
}

/** Shape of the protocol `matchStarted` message. */
export interface MatchStartedPayload {
  type: 'matchStarted';
  seed: number;
  terrain: TerrainParams;
  settings: MatchSettings;
  teams: { id: string; name: string; colour: string; snails: { id: string; name: string }[] }[];
}

const FRAME_MS = 16;
const STEP_MS = FIXED_DT * 1000;
const realClock: SessionClock = {
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

/**
 * Authoritative game session: owns the core simulation, steps it at a fixed timestep, applies
 * controller intents and publishes snapshots and events through callbacks.
 */
export class GameSession {
  private readonly match: MatchSetup;
  private readonly terrainParams: TerrainParams;
  private readonly teamPlayers = new Map<string, string[]>();
  private readonly cursors = new Map<string, number>();
  private activePlayer: string | undefined;
  private readonly control = new Map<string, TeamControlState>();
  private readonly clock: SessionClock;
  private readonly snapshotEvery: number;
  private readonly maxSteps: number;
  private acc = 0;
  private last = 0;
  private handle: unknown = null;
  private announced = false;
  private ended = false;
  private lastTimerSecond = -1;

  /** @throws Error if the terrain cannot host all snails. */
  constructor(private readonly opts: GameSessionOptions) {
    this.clock = opts.clock ?? realClock;
    this.snapshotEvery = Math.max(1, Math.round(1 / (FIXED_DT * (opts.snapshotHz ?? 20))));
    this.maxSteps = Math.max(1, opts.maxStepsPerFrame ?? 8);
    this.terrainParams = { ...DEFAULT_TERRAIN_CONFIG, ...opts.terrain };
    const content = loadServerContent().registries;
    const defs = opts.weapons ?? content.weapons.list();
    const defaultWeapon = defs[0]?.id ?? '';
    for (const t of opts.teams) {
      this.teamPlayers.set(t.id, [...t.playerIds]);
      this.control.set(t.id, { direction: 0, weaponId: defaultWeapon });
    }
    this.match = createMatch({
      seed: opts.settings.seed,
      terrain: this.terrainParams,
      turn: { actionDuration: opts.settings.turnTimeSeconds },
      weapons: defs,
      statuses: content.statuses.list(),
      areas: content.areas.list(),
      teams: opts.teams.map((t) => ({
        id: t.id,
        name: t.name,
        colour: t.colour,
        snailNames: Array.from(
          { length: opts.settings.snailsPerTeam },
          (_, i) => `${t.name} ${i + 1}`,
        ),
      })),
    });
  }

  /** The `matchStarted` payload describing this session. */
  matchStartedMessage(): MatchStartedPayload {
    return {
      type: 'matchStarted',
      seed: this.opts.settings.seed,
      terrain: this.terrainParams,
      settings: this.opts.settings,
      teams: this.match.sim.state.teams.map((t) => ({
        id: t.id,
        name: t.name,
        colour: t.colour,
        snails: t.snails.map((s) => ({ id: s.id, name: s.name })),
      })),
    };
  }

  /** Current simulation tick. */
  get tick(): number {
    return this.match.sim.state.tick;
  }

  /** Id of the snail whose turn it is, or null. */
  get activeSnailId(): string | null {
    return this.match.sim.state.turn.activeSnailId ?? null;
  }

  /** Weapon id the active team has selected, or null. */
  get activeWeaponId(): string | null {
    const t = this.activeTeamId;
    return t ? (this.control.get(t)?.weaponId ?? null) : null;
  }

  /** Launch spec of the active team's selected weapon, or null. */
  get activeLaunch(): WeaponLaunchSpec | null {
    const id = this.activeWeaponId;
    return (id ? this.match.weapons.get(id)?.launch : undefined) ?? null;
  }

  /** Motion parameters of the active team's selected weapon, or null for plain ballistic. */
  get activeMotion(): MotionSpec | null {
    const id = this.activeWeaponId;
    return (id ? this.match.weapons.get(id)?.motion : undefined) ?? null;
  }

  /** Current aim (angle, power) of the active snail, or null. */
  get activeAim(): { angle: number; power: number } | null {
    const s = this.activeSnail();
    return s ? getAim(s) : null;
  }

  /** Id of the team whose turn it is, or null. */
  get activeTeamId(): string | null {
    return this.match.sim.state.turn.activeTeamId ?? null;
  }

  /**
   * The turn currently in progress for late joiners: the `turnStart` info plus the remaining
   * action time in ms (null outside the action phase). Null when no turn is active.
   */
  currentTurn(): { info: TurnStartInfo; remainingMs: number | null } | null {
    const { turn } = this.match.sim.state;
    if (!turn.activeTeamId || !turn.activeSnailId || this.ended) return null;
    return {
      info: {
        teamId: turn.activeTeamId,
        snailId: turn.activeSnailId,
        durationMs: this.opts.settings.turnTimeSeconds * 1000,
        ...(this.activePlayer ? { activePlayerId: this.activePlayer } : {}),
      },
      remainingMs:
        turn.phase === 'action' ? Math.max(0, Math.round(turn.timeRemaining * 1000)) : null,
    };
  }

  /** Starts the real-time loop on the injected clock. */
  start(): void {
    if (this.handle !== null) return;
    this.announceFirstTurn();
    this.last = this.clock.now();
    this.handle = this.clock.setInterval(() => {
      const now = this.clock.now();
      this.runFrame(now - this.last);
      this.last = now;
    }, FRAME_MS);
  }

  /** Stops the loop. */
  stop(): void {
    if (this.handle === null) return;
    this.clock.clearInterval(this.handle);
    this.handle = null;
  }

  /** Advances the session by `ms` of simulated wall time (for tests and manual drivers). */
  advance(ms: number): void {
    this.announceFirstTurn();
    this.runFrame(ms);
  }

  /** Builds the current compact snapshot. */
  snapshot(): Snapshot {
    return encodeSnapshot(this.decoded());
  }

  /** Applies a controller intent for `playerId`; returns a rejection reason when refused. */
  applyIntent(playerId: string, intent: GameIntent): IntentResult {
    const state = this.match.sim.state;
    const teamId = state.turn.activeTeamId;
    if (![...this.teamPlayers.values()].some((ids) => ids.includes(playerId)))
      return { ok: false, reason: 'unknown_player' };
    if (this.ended || state.match.status !== 'playing') return { ok: false, reason: 'match_over' };
    const roster = teamId ? (this.teamPlayers.get(teamId) ?? []) : [];
    const mode = this.opts.settings.controlMode;
    if (!teamId || !mayCommandTurn(mode, roster, this.activePlayer, playerId))
      return { ok: false, reason: 'not_your_turn' };
    const guiding = intent.type === 'steer' && ['fire', 'resolve'].includes(state.turn.phase);
    if (state.turn.phase !== 'action' && !guiding) return { ok: false, reason: 'wrong_phase' };
    const control = this.control.get(teamId) as TeamControlState;
    if (intent.type === 'selectWeapon') return this.selectWeapon(control, intent.weaponId);
    const snail = this.activeSnail();
    if (!snail) return { ok: false, reason: 'no_active_snail' };
    const cmd = intentToCommand(intent, snail, teamId, control);
    if (!cmd) return { ok: true };
    const res = this.match.sim.submit(cmd, teamId);
    return res.ok ? { ok: true } : { ok: false, reason: res.reason.toLowerCase() };
  }

  private selectWeapon(control: TeamControlState, weaponId: string): IntentResult {
    if (!this.match.weapons.has(weaponId)) return { ok: false, reason: 'unknown_weapon' };
    control.weaponId = weaponId;
    return { ok: true };
  }

  private activeSnail(): Snail | undefined {
    const { turn, teams } = this.match.sim.state;
    return teams.flatMap((t) => t.snails).find((s) => s.id === turn.activeSnailId);
  }

  private announceFirstTurn(): void {
    if (this.announced) return;
    this.announced = true;
    this.notifyTurnStart();
  }

  private notifyTurnStart(): void {
    const { turn } = this.match.sim.state;
    if (!turn.activeTeamId || !turn.activeSnailId) return;
    this.lastTimerSecond = -1;
    const pick = pickActivePlayer(
      this.teamPlayers.get(turn.activeTeamId) ?? [],
      this.cursors.get(turn.activeTeamId) ?? 0,
      this.opts.isConnected ?? (() => true),
    );
    this.cursors.set(turn.activeTeamId, pick.next);
    this.activePlayer = pick.playerId;
    this.opts.onTurnStart?.({
      teamId: turn.activeTeamId,
      snailId: turn.activeSnailId,
      durationMs: this.opts.settings.turnTimeSeconds * 1000,
      ...(pick.playerId ? { activePlayerId: pick.playerId } : {}),
    });
  }

  private runFrame(ms: number): void {
    if (this.ended) return;
    this.acc += Math.max(0, ms);
    let steps = 0;
    while (this.acc >= STEP_MS - 1e-9 && steps < this.maxSteps && !this.ended) {
      this.acc -= STEP_MS;
      steps++;
      this.stepOnce();
    }
    if (this.acc >= STEP_MS) this.acc = 0; // spiral-of-death guard: drop the backlog
  }

  private stepOnce(): void {
    const { sim } = this.match;
    const events = sim.step(FIXED_DT);
    this.opts.onEvents?.(encodeEventBatch(sim.state.tick, events));
    this.handleEvents(events);
    if (sim.state.tick % this.snapshotEvery === 0) this.opts.onSnapshot?.(this.snapshot());
    this.emitTimer();
  }

  private handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'turnStarted') this.notifyTurnStart();
      else if (e.type === 'matchEnded' && !this.ended) {
        this.ended = true;
        this.opts.onMatchEnd?.(e.winnerTeamId ?? null);
      }
    }
  }

  private emitTimer(): void {
    const { turn } = this.match.sim.state;
    if (turn.phase !== 'action' || this.ended) return;
    const second = Math.ceil(turn.timeRemaining);
    if (second === this.lastTimerSecond) return;
    this.lastTimerSecond = second;
    this.opts.onTurnTimer?.(Math.max(0, Math.round(turn.timeRemaining * 1000)));
  }

  private decoded(): DecodedSnapshot {
    const s = this.match.sim.state;
    return {
      tick: s.tick,
      wind: { ...s.wind },
      turn: {
        activeTeamId: s.turn.activeTeamId,
        activeSnailId: s.turn.activeSnailId,
        phase: s.turn.phase as WirePhase,
        timeRemaining: s.turn.timeRemaining,
        turnNumber: s.turn.turnNumber,
      },
      snails: s.teams.flatMap((t) =>
        t.snails.map((n) => ({
          id: n.id,
          position: n.position,
          velocity: n.velocity,
          facing: n.facing,
          health: n.health,
          state: snailWireState(n),
          aim: n.aim ?? { angle: 0, power: 0 },
        })),
      ),
      projectiles: s.projectiles.map((p) => ({
        id: p.id,
        weaponId: p.weaponId,
        position: p.position,
        velocity: p.velocity,
      })),
      statuses: s.teams.flatMap((t) =>
        t.snails.flatMap((n) =>
          (n.statuses ?? []).map((st) => ({
            snailId: n.id,
            statusId: st.id,
            turnsLeft: st.turnsLeft,
            magnitude: st.magnitude,
          })),
        ),
      ),
      areas: s.areas.map((a) => ({
        id: a.id,
        kind: a.kind,
        position: a.position,
        radius: a.radius,
        turnsLeft: a.turnsLeft,
      })),
    };
  }
}

function snailWireState(n: Snail): 'dead' | 'grounded' | 'airborne' {
  if (!n.alive) return 'dead';
  return n.grounded === false ? 'airborne' : 'grounded';
}
