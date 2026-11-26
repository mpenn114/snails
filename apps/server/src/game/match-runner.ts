import {
  isTerrainEvent,
  type MatchSettings,
  type ServerMessage,
  type WireEvent,
} from '@snails/protocol';
import type { IntentMessage } from '../net/connection.js';
import { sanitiseName } from '@snails/protocol';
import { createCpuPlayer, type CpuPlayer } from '@snails/ai';
import type { CpuTeam } from '../rooms/cpu-teams.js';
import type { ActiveMatch, Member, Room } from '../rooms/room.js';
import { GameSession, type SessionClock, type SessionTeam } from './game-session.js';
import { clamp, HALF_PI } from './intent.js';
import { TEAM_COLOUR_PALETTE } from './palette.js';
import { filterMessage } from './privacy.js';

export { TEAM_COLOUR_PALETTE } from './palette.js';

/** Options for {@link MatchRunner} (all optional; tests inject fakes). */
export interface MatchRunnerOptions {
  /** Session clock (default real timers). */
  clock?: SessionClock;
  /** Wall clock in ms for throttling. Default `Date.now`. */
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
  /** Minimum gap between `aimPreview` relays in ms. Default 66 (~15 Hz). */
  aimIntervalMs?: number;
  /** Minimum gap between `not_your_turn` errors per player in ms. Default 1000. */
  rejectIntervalMs?: number;
  /** Grace before auto-ending the turn of a team with nobody connected. Default 10000. */
  absentTurnGraceMs?: number;
  /** Think time before a CPU's first command each turn in ms. Default 1000; tests use 0. */
  cpuThinkMs?: number;
  /** How long the final state stays up (winner screen) before the room returns to the lobby. Default 8000. */
  endHoldMs?: number;
}

/**
 * Builds session teams (team to player ids) from the controllers in a lobby. Every team gets a
 * distinct colour: a member's chosen colour goes to their first team only (hot-seat phones own
 * several teams); other teams take the first palette colour nobody has claimed.
 */
export function buildTeams(
  members: readonly Member[],
  cpus: readonly CpuTeam[] = [],
): SessionTeam[] {
  const controllers = members.filter((m) => m.role === 'controller');
  const claimed = new Set<string>(cpus.map((c) => c.colour.toLowerCase()));
  const chosen = new Map<string, string>();
  for (const m of controllers) {
    const c = m.colour?.toLowerCase();
    const first = m.teamIds[0];
    if (c && first && !claimed.has(c) && !chosen.has(first)) {
      claimed.add(c);
      chosen.set(first, m.colour ?? c);
    }
  }
  const teams = new Map<string, SessionTeam>();
  for (const m of controllers) {
    for (const teamId of m.teamIds) {
      let t = teams.get(teamId);
      if (!t) {
        let colour = chosen.get(teamId);
        if (!colour) {
          colour =
            TEAM_COLOUR_PALETTE.find((c) => !claimed.has(c)) ??
            TEAM_COLOUR_PALETTE[teams.size % TEAM_COLOUR_PALETTE.length] ??
            '#888888';
          claimed.add(colour.toLowerCase());
        }
        const own = m.teamIds[0] === teamId;
        const label = m.teamName || teamId;
        t = {
          id: teamId,
          name: own ? label : sanitiseName(`${label} ${teamId}`),
          colour,
          playerIds: [],
          ...(own && m.snailNames && m.snailNames.length > 0
            ? { snailNames: [...m.snailNames] }
            : {}),
        };
        teams.set(teamId, t);
      }
      t.playerIds.push(m.id);
    }
  }
  for (const c of cpus)
    teams.set(c.id, { id: c.id, name: c.name, colour: c.colour, playerIds: [] });
  return [...teams.values()];
}

/** Wall-clock emergency cutoff (ms) for one CPU turn plan; the work budget normally ends it first. */
const CPU_DEADLINE_MS = 200;

/** One {@link CpuPlayer} per CPU team, seeded with the match seed plus the team's index. */
function buildCpuPlayers(
  teams: readonly SessionTeam[],
  cpus: readonly CpuTeam[],
  seed: number,
): Map<string, CpuPlayer> {
  const out = new Map<string, CpuPlayer>();
  for (const c of cpus) {
    const index = teams.findIndex((t) => t.id === c.id);
    const { difficulty, personality } = c;
    out.set(
      c.id,
      createCpuPlayer(
        { difficulty, personality, seed: seed + index },
        { deadlineMs: CPU_DEADLINE_MS },
      ),
    );
  }
  return out;
}

/** Teams whose private research a member may see: controllers see their own, displays none. */
function viewerTeams(member: Member): readonly string[] {
  return member.role === 'controller' ? member.teamIds : [];
}

/**
 * Runs one match for a room: owns the {@link GameSession}, broadcasts its output to every
 * client, authorises intents (`perPlayer`: the turn's rotating commander; `hotSeat`: any phone
 * bound to the active team) and relays throttled aim previews.
 */
export class MatchRunner implements ActiveMatch {
  private readonly session: GameSession;
  private latest: ServerMessage | null = null;
  private lastInventory = '';
  /**
   * Ordered wire-form terrain events of the whole match, replayed to late clients. A match has at
   * most a few hundred carves/collapses (a few hundred KB), so it is kept unbounded.
   */
  private readonly terrainLog: WireEvent[] = [];
  private readonly lastReject = new Map<string, number>();
  private pendingAim: { msg: ServerMessage; from: string } | null = null;
  private aimTimer: unknown = null;
  private lastAimAt = Number.NEGATIVE_INFINITY;
  private stopped = false;
  private skipTimer: unknown = null;
  private endTimer: unknown = null;
  private readonly teamPlayers = new Map<string, string[]>();
  private readonly now: () => number;

  constructor(
    private readonly room: Room,
    settings: MatchSettings,
    members: readonly Member[],
    private readonly opts: MatchRunnerOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    const cpus = room.cpuTeams;
    const teams = buildTeams(members, cpus);
    for (const t of teams) this.teamPlayers.set(t.id, t.playerIds);
    this.session = new GameSession({
      settings,
      teams,
      ...(opts.clock ? { clock: opts.clock } : {}),
      cpuPlayers: buildCpuPlayers(teams, cpus, settings.seed),
      ...(opts.cpuThinkMs !== undefined ? { cpuThinkMs: opts.cpuThinkMs } : {}),
      isConnected: (id) => this.isTeamPresent([id]),
      onSnapshot: (s) => {
        this.latest = s;
        this.broadcast(s);
        this.broadcastInventory();
      },
      onEvents: (b) => {
        for (const e of b.events) if (isTerrainEvent(e)) this.terrainLog.push(e);
        this.broadcast(b);
      },
      onTurnStart: (i) => {
        this.broadcast({ type: 'turnStart', ...i });
        this.membersChanged();
      },
      onTurnTimer: (remainingMs) => this.broadcast({ type: 'turnTimer', remainingMs }),
      onMatchEnd: () => this.scheduleEnd(),
    });
    this.latest = this.session.snapshot();
    this.broadcast(this.session.matchStartedMessage());
    this.broadcast(this.latest);
    this.broadcastInventory();
    this.session.start();
  }

  /** Sends `matchStarted`, the terrain history, a fresh snapshot and the current turn state to a (re)joining member. */
  catchUp(member: Member): void {
    member.send(this.session.matchStartedMessage());
    if (this.terrainLog.length > 0)
      member.send({
        type: 'terrainHistory',
        tick: this.session.tick,
        events: [...this.terrainLog],
      });
    member.send(filterMessage(this.session.snapshot(), viewerTeams(member)));
    member.send(this.session.inventoryMessage());
    const turn = this.session.currentTurn();
    if (!turn) return;
    member.send({ type: 'turnStart', ...turn.info });
    if (turn.remainingMs !== null)
      member.send({ type: 'turnTimer', remainingMs: turn.remainingMs });
  }

  /**
   * Turn-skip policy: when nobody on the active team is connected, end that turn after the
   * grace period (the turn timer may end it sooner). Re-evaluated on every connect/disconnect
   * and turn start.
   */
  membersChanged(): void {
    this.clearSkip();
    const teamId = this.session.activeTeamId;
    if (this.stopped || !teamId) return;
    const ids = this.teamPlayers.get(teamId) ?? [];
    if (this.isTeamPresent(ids)) return;
    this.armSkip(teamId, ids[0], this.opts.absentTurnGraceMs ?? 10_000);
  }

  private isTeamPresent(ids: readonly string[]): boolean {
    for (const m of this.room.members.values()) if (ids.includes(m.id) && m.connected) return true;
    return false;
  }

  private armSkip(teamId: string, playerId: string | undefined, ms: number): void {
    if (playerId === undefined) return;
    this.skipTimer = (this.opts.setTimeout ?? setTimeout)(() => {
      this.skipTimer = null;
      if (this.stopped || this.session.activeTeamId !== teamId) return;
      const res = this.session.applyIntent(playerId, { type: 'endTurn' });
      // Intro/other phases refuse the end; retry shortly until the action phase.
      if (!res.ok && res.reason === 'wrong_phase') this.armSkip(teamId, playerId, 1000);
    }, ms);
  }

  private clearSkip(): void {
    if (this.skipTimer !== null) (this.opts.clearTimeout ?? clearTimeout)(this.skipTimer as never);
    this.skipTimer = null;
  }

  /** Authorises and applies an intent; relays aim previews. */
  intent(member: Member, intent: IntentMessage): void {
    if (this.stopped) return;
    const res = this.session.applyIntent(member.id, intent);
    if (!res.ok) {
      if (res.reason === 'not_your_turn') this.rejectNotYourTurn(member);
      return;
    }
    if (intent.type === 'aim') {
      this.queueAim(member, clamp(intent.angle, -HALF_PI, HALF_PI), clamp(intent.power, 0, 1));
    } else if (intent.type === 'selectWeapon') {
      const aim = this.session.activeAim;
      if (aim) this.queueAim(member, aim.angle, aim.power);
    }
  }

  /** Current simulation tick. */
  currentTick(): number {
    return this.session.tick;
  }

  /** Lets clients show the result, then returns the room to the lobby. */
  private scheduleEnd(): void {
    if (this.stopped || this.endTimer !== null) return;
    this.clearSkip();
    this.endTimer = (this.opts.setTimeout ?? setTimeout)(() => {
      this.endTimer = null;
      this.room.endMatch();
    }, this.opts.endHoldMs ?? 8000);
  }

  /** Stops the session and pending timers. */
  stop(): void {
    this.stopped = true;
    if (this.endTimer !== null) (this.opts.clearTimeout ?? clearTimeout)(this.endTimer as never);
    this.endTimer = null;
    this.session.stop();
    this.clearSkip();
    if (this.aimTimer !== null) (this.opts.clearTimeout ?? clearTimeout)(this.aimTimer as never);
    this.aimTimer = null;
    this.pendingAim = null;
  }

  /** Broadcasts the inventory when it differs from the last one sent. */
  private broadcastInventory(): void {
    const msg = this.session.inventoryMessage();
    const key = JSON.stringify(msg);
    if (key === this.lastInventory) return;
    this.lastInventory = key;
    this.broadcast(msg);
  }

  private broadcast(msg: ServerMessage): void {
    for (const m of this.room.members.values()) m.send(filterMessage(msg, viewerTeams(m)));
  }

  private rejectNotYourTurn(member: Member): void {
    const t = this.now();
    const last = this.lastReject.get(member.id) ?? Number.NEGATIVE_INFINITY;
    if (t - last < (this.opts.rejectIntervalMs ?? 1000)) return;
    this.lastReject.set(member.id, t);
    member.send({ type: 'error', code: 'not_your_turn', message: 'Not your turn' });
  }

  private queueAim(member: Member, angle: number, power: number): void {
    const snailId = this.session.activeSnailId;
    const weaponId = this.session.activeWeaponId;
    const launch = this.session.activeLaunch;
    if (!snailId || !weaponId || !launch) return;
    const motion = this.session.activeMotion;
    const melee = this.session.activeMelee;
    this.pendingAim = {
      msg: {
        type: 'aimPreview',
        snailId,
        weaponId,
        launch,
        ...(motion ? { motion } : {}),
        ...(melee ? { melee } : {}),
        angle,
        power,
      },
      from: member.id,
    };
    const wait = this.lastAimAt + (this.opts.aimIntervalMs ?? 66) - this.now();
    if (wait <= 0) this.flushAim();
    else if (this.aimTimer === null) {
      this.aimTimer = (this.opts.setTimeout ?? setTimeout)(() => this.flushAim(), wait);
    }
  }

  private flushAim(): void {
    this.aimTimer = null;
    const p = this.pendingAim;
    this.pendingAim = null;
    if (!p || this.stopped) return;
    this.lastAimAt = this.now();
    for (const m of this.room.members.values()) if (m.id !== p.from) m.send(p.msg);
  }
}
