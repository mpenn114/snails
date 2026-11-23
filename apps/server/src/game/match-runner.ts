import type { MatchSettings, ServerMessage } from '@snails/protocol';
import type { IntentMessage } from '../net/connection.js';
import type { ActiveMatch, Member, Room } from '../rooms/room.js';
import { GameSession, type SessionClock, type SessionTeam } from './game-session.js';

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
}

const FALLBACK_COLOURS = ['#e63946', '#2a9d8f', '#e9c46a', '#457b9d', '#9b5de5', '#f4a261'];

/** Builds session teams (team to player ids) from the controllers in a lobby. */
export function buildTeams(members: readonly Member[]): SessionTeam[] {
  const teams = new Map<string, SessionTeam>();
  for (const m of members) {
    if (m.role !== 'controller' || !m.teamId) continue;
    let t = teams.get(m.teamId);
    if (!t) {
      const colour =
        m.colour ?? FALLBACK_COLOURS[teams.size % FALLBACK_COLOURS.length] ?? '#888888';
      t = { id: m.teamId, name: m.teamId, colour, playerIds: [] };
      teams.set(m.teamId, t);
    }
    t.playerIds.push(m.id);
  }
  return [...teams.values()];
}

/**
 * Runs one match for a room: owns the {@link GameSession}, broadcasts its output to every
 * client, authorises intents (only the active team's controllers may command; hot-seat mode,
 * where one phone drives several teams, is a later task) and relays throttled aim previews.
 */
export class MatchRunner implements ActiveMatch {
  private readonly session: GameSession;
  private latest: ServerMessage | null = null;
  private readonly lastReject = new Map<string, number>();
  private pendingAim: { msg: ServerMessage; from: string } | null = null;
  private aimTimer: unknown = null;
  private lastAimAt = Number.NEGATIVE_INFINITY;
  private stopped = false;
  private skipTimer: unknown = null;
  private readonly teamPlayers = new Map<string, string[]>();
  private readonly now: () => number;

  constructor(
    private readonly room: Room,
    settings: MatchSettings,
    members: readonly Member[],
    private readonly opts: MatchRunnerOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    const teams = buildTeams(members);
    for (const t of teams) this.teamPlayers.set(t.id, t.playerIds);
    this.session = new GameSession({
      settings,
      teams,
      ...(opts.clock ? { clock: opts.clock } : {}),
      onSnapshot: (s) => {
        this.latest = s;
        this.broadcast(s);
      },
      onEvents: (b) => this.broadcast(b),
      onTurnStart: (i) => {
        this.broadcast({ type: 'turnStart', ...i });
        this.membersChanged();
      },
      onTurnTimer: (remainingMs) => this.broadcast({ type: 'turnTimer', remainingMs }),
      onMatchEnd: () => this.room.endMatch(),
    });
    this.latest = this.session.snapshot();
    this.broadcast(this.session.matchStartedMessage());
    this.broadcast(this.latest);
    this.session.start();
  }

  /** Sends `matchStarted`, a fresh snapshot and the current turn state to a (re)joining member. */
  catchUp(member: Member): void {
    member.send(this.session.matchStartedMessage());
    member.send(this.session.snapshot());
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
    if (this.stopped || intent.type === 'queueResearch') return;
    const res = this.session.applyIntent(member.id, intent);
    if (!res.ok) {
      if (res.reason === 'not_your_turn') this.rejectNotYourTurn(member);
      return;
    }
    if (intent.type === 'aim') this.queueAim(member, intent.angle, intent.power);
  }

  /** Current simulation tick. */
  currentTick(): number {
    return this.session.tick;
  }

  /** Stops the session and pending timers. */
  stop(): void {
    this.stopped = true;
    this.session.stop();
    this.clearSkip();
    if (this.aimTimer !== null) (this.opts.clearTimeout ?? clearTimeout)(this.aimTimer as never);
    this.aimTimer = null;
    this.pendingAim = null;
  }

  private broadcast(msg: ServerMessage): void {
    for (const m of this.room.members.values()) m.send(msg);
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
    if (!snailId) return;
    this.pendingAim = { msg: { type: 'aimPreview', snailId, angle, power }, from: member.id };
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
