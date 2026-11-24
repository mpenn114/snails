import type { GameSnapshot, Snail, Team } from '@snails/core';
import type { DecodedSnapshot } from '@snails/protocol';

/** Roster entry of one team, as announced by the server's `matchStarted` message. */
export interface WireTeamInfo {
  id: string;
  name: string;
  colour: string;
  snails: readonly { id: string; name: string }[];
}

/** Static match data the compact snapshots are interpreted against. */
export interface WireMatchInfo {
  seed: number;
  teams: readonly WireTeamInfo[];
  terrain: { nx: number; ny: number; nz: number; cellSize: number; waterLevel: number };
  /** Health assumed as the maximum until a higher value is observed. */
  initialMaxHealth?: number;
}

const DEFAULT_MAX_HEALTH = 100;
const PROJECTILE_RADIUS = 0.15;

/**
 * Turns decoded compact wire snapshots into renderable {@link GameSnapshot}s. The renderer only
 * reads positions, health, facing, aim, wind, turn and team identity, so rule-only fields are
 * filled with neutral defaults. Shared by the phone and (later) display adapters.
 */
export class WireSnapshotMapper {
  private readonly maxHealth = new Map<string, number>();

  constructor(private readonly info: WireMatchInfo) {}

  /** Maps one decoded snapshot. Snails missing from the snapshot are omitted. */
  map(s: DecodedSnapshot): GameSnapshot {
    const byId = new Map(s.snails.map((n) => [n.id, n]));
    const teams: Team[] = this.info.teams.map((t) => ({
      id: t.id,
      name: t.name,
      colour: t.colour,
      researched: [],
      nextSnailIndex: 0,
      snails: t.snails.flatMap((r) => {
        const n = byId.get(r.id);
        return n ? [this.snail(t, r.name, n, s.statuses)] : [];
      }),
    }));
    return {
      tick: s.tick,
      seed: this.info.seed,
      wind: { ...s.wind },
      terrain: { ...this.info.terrain },
      teams,
      turn: {
        ...s.turn,
        phaseTime: 0,
        fired: s.turn.phase !== 'action' && s.turn.phase !== 'intro',
      },
      projectiles: s.projectiles.map((p) => ({
        id: p.id,
        position: p.position,
        velocity: p.velocity,
        ownerSnailId: s.turn.activeSnailId ?? '',
        weaponId: p.weaponId,
        radius: PROJECTILE_RADIUS,
        age: 0,
        maxAge: 0,
        gravityScale: 1,
        windScale: 1,
      })),
      nextProjectileId: 0,
      areas: s.areas.map((a) => ({
        id: a.id,
        kind: a.kind,
        position: a.position,
        radius: a.radius,
        turnsLeft: a.turnsLeft,
        sourceSnailId: '',
      })),
      nextAreaId: 0,
      match: { status: 'playing', winnerTeamId: null },
    };
  }

  private snail(
    team: WireTeamInfo,
    name: string,
    n: DecodedSnapshot['snails'][number],
    allStatuses: DecodedSnapshot['statuses'],
  ): Snail {
    const own = allStatuses.filter((t) => t.snailId === n.id);
    const prev = this.maxHealth.get(n.id) ?? this.info.initialMaxHealth ?? DEFAULT_MAX_HEALTH;
    const maxHealth = Math.max(prev, n.health);
    this.maxHealth.set(n.id, maxHealth);
    return {
      id: n.id,
      teamId: team.id,
      name,
      position: n.position,
      velocity: n.velocity,
      facing: n.facing,
      health: n.health,
      maxHealth,
      alive: n.state !== 'dead' && n.health > 0,
      shell: { upgradeId: null, colour: team.colour },
      aim: { ...n.aim },
      grounded: n.state === 'grounded',
      ...(own.length > 0
        ? {
            statuses: own.map((t) => ({
              id: t.statusId,
              turnsLeft: t.turnsLeft,
              magnitude: t.magnitude,
              sourceSnailId: '',
            })),
          }
        : {}),
    };
  }
}
