import {
  FIXED_DT,
  createMatch,
  DEFAULT_TERRAIN_CONFIG,
  resolveMapStyle,
  type MatchSetup,
  type SimEvent,
  type Snail,
  type WeaponDefinition,
  type MotionSpec,
  type WeaponLaunchSpec,
  getAim,
  isWeaponLocked,
  weaponAvailability,
} from '@snails/core';
import {
  encodeEventBatch,
  encodeSnapshot,
  type DecodedSnapshot,
  type EventBatch,
  type Inventory,
  MatchSettings,
  type MatchSettingsInput,
  type Snapshot,
  type TerrainParams,
  type WirePhase,
} from '@snails/protocol';
import type { CpuPlayer } from '@snails/ai';
import { CpuDriver } from './cpu-driver.js';
import {
  intentToCommand,
  type GameIntent,
  type IntentResult,
  type ResearchIntent,
  type TeamControlState,
  type TurnIntent,
} from './intent.js';

import { loadServerContent } from './server-content.js';
import { snailWireState, wireCrates, wireHill, wireScheduled } from './wire-views.js';
import { researchFields } from './privacy.js';
import { mayCommandTurn, researchTeamFor, pickActivePlayer } from './rotation.js';

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
  settings: MatchSettingsInput;
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
  /** CPU players by team id; those teams are driven by the session, not by phones. */
  cpuPlayers?: ReadonlyMap<string, CpuPlayer>;
  /** Think time before a CPU's first command of a turn in ms (default 1000; 0 in tests). */
  cpuThinkMs?: number;
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
  private readonly cpu: CpuDriver | null = null;
  private readonly terrainParams: TerrainParams;
  private readonly settings: MatchSettings;
  private readonly teamPlayers = new Map<string, string[]>();
  private readonly cursors = new Map<string, number>();
  private activePlayer: string | undefined;
  private readonly control = new Map<string, TeamControlState>();
  private readonly defaultWeapon: string;
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
    this.settings = MatchSettings.parse(opts.settings);
    this.clock = opts.clock ?? realClock;
    this.snapshotEvery = Math.max(1, Math.round(1 / (FIXED_DT * (opts.snapshotHz ?? 20))));
    this.maxSteps = Math.max(1, opts.maxStepsPerFrame ?? 8);
    const style = resolveMapStyle(this.settings.mapStyle, this.settings.seed);
    this.terrainParams = { ...DEFAULT_TERRAIN_CONFIG, style, ...opts.terrain };
    const content = loadServerContent().registries;
    const defs = opts.weapons ?? content.weapons.list();
    // Default pick: an unlimited plain projectile that needs no research, else the first ungated.
    const ungated = defs.filter((w) => w.requiresTech === undefined);
    const plain = ungated.find((w) => w.ammo === 'infinite' && w.category === 'projectile');
    const defaultWeapon = (plain ?? ungated[0] ?? defs[0])?.id ?? '';
    this.defaultWeapon = defaultWeapon;
    for (const t of opts.teams) {
      this.teamPlayers.set(t.id, [...t.playerIds]);
      this.control.set(t.id, { direction: 0, turn: 0, weaponId: defaultWeapon });
    }
    this.match = createMatch({
      seed: this.settings.seed,
      terrain: this.terrainParams,
      settings: this.settings,
      winds: content.winds.list(),
      weapons: defs,
      statuses: content.statuses.list(),
      areas: content.areas.list(),
      crates: content.crates.list(),
      technologies: content.technologies.list(),
      teams: opts.teams.map((t) => ({
        id: t.id,
        name: t.name,
        colour: t.colour,
        snailNames: Array.from(
          { length: this.settings.snailsPerTeam },
          (_, i) => `${t.name} ${i + 1}`,
        ),
      })),
    });
    if (opts.cpuPlayers && opts.cpuPlayers.size > 0)
      this.cpu = new CpuDriver(this.match, {
        players: opts.cpuPlayers,
        ...(opts.cpuThinkMs !== undefined ? { thinkMs: opts.cpuThinkMs } : {}),
      });
  }

  /** The `matchStarted` payload describing this session. */
  matchStartedMessage(): MatchStartedPayload {
    return {
      type: 'matchStarted',
      seed: this.settings.seed,
      terrain: this.terrainParams,
      settings: this.settings,
      teams: this.match.sim.state.teams.map((t) => ({
        id: t.id,
        name: t.name,
        colour: t.colour,
        snails: t.snails.map((s) => ({ id: s.id, name: s.name })),
      })),
    };
  }

  /** Every team's weapon stock and tech locks (the `inventory` wire message). */
  inventoryMessage(): Inventory {
    const weapons = this.match.weapons.list();
    return {
      type: 'inventory',
      teams: this.match.sim.state.teams.map((t) => ({
        teamId: t.id,
        stock: { ...t.inventory },
        locked: Object.fromEntries(
          weapons.flatMap((w) =>
            w.requiresTech !== undefined && isWeaponLocked(t, w) ? [[w.id, w.requiresTech]] : [],
          ),
        ),
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

  /** Melee parameters of the active team's selected weapon, or null for projectile weapons. */
  get activeMelee(): { reach: number } | null {
    const id = this.activeWeaponId;
    return (id ? this.match.weapons.get(id)?.melee : undefined) ?? null;
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
        durationMs: this.settings.turnTimeSeconds * 1000,
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
    if (intent.type === 'queueResearch' || intent.type === 'cancelResearch')
      return this.applyResearch(playerId, intent);
    return this.applyTurnIntent(playerId, intent);
  }

  /**
   * Routes a research intent to the sim for the sender's team (the active team when the sender
   * controls it, else their first team). Allowed in any phase, not only on the team's turn.
   */
  private applyResearch(playerId: string, intent: ResearchIntent): IntentResult {
    const state = this.match.sim.state;
    const teamId = researchTeamFor(this.teamPlayers, playerId, state.turn.activeTeamId);
    if (!teamId) return { ok: false, reason: 'unknown_player' };
    if (this.ended || state.match.status !== 'playing') return { ok: false, reason: 'match_over' };
    const res = this.match.sim.submit({ type: intent.type, teamId, techId: intent.techId }, teamId);
    return res.ok ? { ok: true } : { ok: false, reason: res.reason.toLowerCase() };
  }

  private applyTurnIntent(playerId: string, intent: TurnIntent): IntentResult {
    const state = this.match.sim.state;
    const teamId = state.turn.activeTeamId;
    if (![...this.teamPlayers.values()].some((ids) => ids.includes(playerId)))
      return { ok: false, reason: 'unknown_player' };
    if (this.ended || state.match.status !== 'playing') return { ok: false, reason: 'match_over' };
    const roster = teamId ? (this.teamPlayers.get(teamId) ?? []) : [];
    const mode = this.settings.controlMode;
    if (!teamId || !mayCommandTurn(mode, roster, this.activePlayer, playerId))
      return { ok: false, reason: 'not_your_turn' };
    const guiding = intent.type === 'steer' && ['fire', 'resolve'].includes(state.turn.phase);
    if (state.turn.phase !== 'action' && !guiding) return { ok: false, reason: 'wrong_phase' };
    const control = this.control.get(teamId) as TeamControlState;
    this.fallBackIfUnavailable(teamId, control);
    if (intent.type === 'selectWeapon') return this.selectWeapon(control, intent.weaponId);
    const snail = this.activeSnail();
    if (!snail) return { ok: false, reason: 'no_active_snail' };
    const cmd = intentToCommand(intent, snail, teamId, control);
    if (!cmd) return { ok: true };
    const res = this.match.sim.submit(cmd, teamId);
    return res.ok ? { ok: true } : { ok: false, reason: res.reason.toLowerCase() };
  }

  private selectWeapon(control: TeamControlState, weaponId: string): IntentResult {
    const weapon = this.match.weapons.get(weaponId);
    if (!weapon) return { ok: false, reason: 'unknown_weapon' };
    const team = this.match.sim.state.teams.find((t) => t.id === this.activeTeamId);
    const status = team ? weaponAvailability(team, weapon) : 'ok';
    if (status !== 'ok') return { ok: false, reason: status.toLowerCase() };
    control.weaponId = weaponId;
    return { ok: true };
  }

  /** Resets a team's selection to the default weapon when it is empty or locked. */
  private fallBackIfUnavailable(teamId: string, control: TeamControlState): void {
    const team = this.match.sim.state.teams.find((t) => t.id === teamId);
    const weapon = this.match.weapons.get(control.weaponId);
    if (!team || !weapon || weaponAvailability(team, weapon) === 'ok') return;
    control.weaponId = this.defaultWeapon;
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
    this.cpu?.planResearch();
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
      durationMs: this.settings.turnTimeSeconds * 1000,
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
    this.cpu?.step();
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
      ...(s.nextWind ? { nextWind: { ...s.nextWind } } : {}),
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
      ...researchFields(s, this.match.content.technologies),
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
      scheduled: wireScheduled(s.scheduled),
      crates: wireCrates(s.crates),
      waterLevel: s.terrain.waterLevel,
      ...wireHill(s),
    };
  }
}
