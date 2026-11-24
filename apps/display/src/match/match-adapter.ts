import type { GameSnapshot, SimEvent, WeaponLaunchSpec } from '@snails/core';
import type { MatchInit } from '@snails/render';
import { WireSnapshotMapper } from '@snails/render';
import { decodeEventBatch, decodeSnapshot } from '@snails/protocol';
import type { ServerMessage } from '@snails/protocol';
import { EMPTY_HUD, hudFromSnapshot } from './hud-model';
import type { HudModel } from './hud-model';

/** The `matchStarted` server message. */
export type MatchStarted = Extract<ServerMessage, { type: 'matchStarted' }>;

/** Renderer surface the adapter drives (MatchRenderer satisfies it; tests inject a fake). */
export interface RendererPort {
  init(init: MatchInit): void;
  pushSnapshot(snapshot: GameSnapshot): unknown;
  handleEvents(events: readonly SimEvent[]): void;
}

/** Aim hint surface. */
export interface AimPort {
  set(
    aim: {
      snailId: string;
      launch?: WeaponLaunchSpec;
      motion?: { kind: string };
      melee?: { reach: number };
      angle: number;
      power: number;
    } | null,
  ): void;
}

/** Everything the adapter talks to. */
export interface MatchAdapterDeps {
  renderer: RendererPort;
  aim: AimPort;
  /** Builds the starting terrain from `matchStarted` (generation lives in the app). */
  buildInit: (m: MatchStarted) => MatchInit;
  /** Receives each new HUD model. */
  onHud: (hud: HudModel) => void;
  /** Called with `true` when the match view should appear, `false` when the lobby returns. */
  onMatchVisible: (visible: boolean) => void;
}

/**
 * Pure adapter from server messages to renderer, aim hint and HUD calls. Snapshots that arrive
 * before `matchStarted` are ignored; a `matchStarted` followed by a mid-match snapshot (late
 * join) renders correctly because terrain is rebuilt from the seed and snapshots are absolute.
 */
export class MatchAdapter {
  private mapper: WireSnapshotMapper | null = null;
  private last: GameSnapshot | null = null;
  private timerMs: number | null = null;
  private winner: HudModel['winner'] = null;
  private inMatch = false;

  constructor(private readonly deps: MatchAdapterDeps) {}

  /** Whether a match is currently shown. */
  get active(): boolean {
    return this.inMatch;
  }

  /** Handles one validated server message. */
  handle(m: ServerMessage): void {
    switch (m.type) {
      case 'matchStarted':
        return this.start(m);
      case 'snapshot':
        return this.snapshot(m);
      case 'eventBatch':
        return this.events(m);
      case 'turnStart':
        this.timerMs = m.durationMs;
        this.deps.aim.set(null);
        return this.refresh();
      case 'turnTimer':
        this.timerMs = m.remainingMs;
        return this.refresh();
      case 'aimPreview':
        if (this.inMatch) this.deps.aim.set(m);
        return;
      case 'lobbyState':
        // Mid-match roster updates (disconnect/reconnect) carry phase 'match' and must not exit.
        return m.phase === 'lobby' ? this.backToLobby() : undefined;
      default:
    }
  }

  private start(m: MatchStarted): void {
    this.mapper = new WireSnapshotMapper({ seed: m.seed, teams: m.teams, terrain: m.terrain });
    this.last = null;
    this.timerMs = null;
    this.winner = null;
    this.inMatch = true;
    this.deps.aim.set(null);
    this.deps.renderer.init(this.deps.buildInit(m));
    this.deps.onHud(EMPTY_HUD);
    this.deps.onMatchVisible(true);
  }

  private snapshot(m: Extract<ServerMessage, { type: 'snapshot' }>): void {
    if (!this.mapper) return;
    this.last = this.mapper.map(decodeSnapshot(m));
    this.timerMs = null;
    this.deps.renderer.pushSnapshot(this.last);
    this.refresh();
  }

  private events(m: Extract<ServerMessage, { type: 'eventBatch' }>): void {
    if (!this.inMatch) return;
    const events = decodeEventBatch(m) as unknown as SimEvent[];
    this.deps.renderer.handleEvents(events);
    for (const e of events) {
      if (e.type === 'matchEnded' && e.status !== 'playing') {
        const team = this.last?.teams.find((t) => t.id === e.winnerTeamId);
        this.winner =
          e.status === 'won' && team
            ? { name: team.name, colour: team.colour }
            : { name: null, colour: null };
        this.deps.aim.set(null);
      }
    }
    this.refresh();
  }

  private backToLobby(): void {
    if (!this.inMatch) return;
    this.inMatch = false;
    this.mapper = null;
    this.last = null;
    this.winner = null;
    this.deps.aim.set(null);
    this.deps.onHud(EMPTY_HUD);
    this.deps.onMatchVisible(false);
  }

  private refresh(): void {
    if (this.last) this.deps.onHud(hudFromSnapshot(this.last, this.timerMs, this.winner));
  }
}
