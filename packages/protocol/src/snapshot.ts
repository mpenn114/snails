import { z } from 'zod';

/** Turn phases in wire index order (matches core's `TurnPhase`). */
export const TURN_PHASES = ['intro', 'action', 'fire', 'resolve', 'retreat', 'settle'] as const;
/** Turn phase. */
export type WirePhase = (typeof TURN_PHASES)[number];

/** Snail state codes on the wire (index order). */
export const SNAIL_STATES = ['dead', 'grounded', 'airborne'] as const;
/** Snail state. */
export type SnailWireState = (typeof SNAIL_STATES)[number];

const int = z.number().int();

/**
 * Wire snail: `[id, px,py,pz (mm), vx,vy,vz (mm/s), facing (mrad), hp, state, aimAngle (mrad),
 * aimPower (permille)]`.
 */
export const WireSnail = z.tuple([
  z.string(),
  int,
  int,
  int,
  int,
  int,
  int,
  int,
  z.number(),
  int,
  int,
  int,
]);
/** Wire projectile: `[id, weaponId, px,py,pz (mm), vx,vy,vz (mm/s)]`. */
export const WireProjectile = z.tuple([z.string(), z.string(), int, int, int, int, int, int]);

/** Wire status: `[snailId, statusId, turnsLeft, magnitude (milli)]`. */
export const WireStatus = z.tuple([z.string(), z.string(), int, int]);
/** Wire area: `[id, kind, px,py,pz (mm), radius (mm), turnsLeft]`. */
export const WireArea = z.tuple([z.string(), z.string(), int, int, int, int, int]);

/**
 * Wire scheduled effect: `[id, groupId, px,py,pz (mm), radius (mm), turnsLeft, style]` with
 * style 0 = strike, 1 = arrival.
 */
export const WireScheduled = z.tuple([z.string(), z.string(), int, int, int, int, int, int]);
/** Wire crate: `[id, defId, px,py,pz (mm), grounded (0 or 1)]`. */
export const WireCrate = z.tuple([z.string(), z.string(), int, int, int, int]);

/** Research presets (mirrors core's `ResearchSetting`). */
export const WireResearchSetting = z.enum(['off', 'on', 'fast']);

/** Private research state of one team (mirrors core's `TeamResearch`). */
export const WireTeamResearch = z.object({
  calcium: z.number(),
  queue: z.array(z.string()),
  active: z.object({ techId: z.string(), turnsLeft: z.number(), paid: z.number() }).nullable(),
  damageCalciumThisTurn: z.number(),
  roundsSinceDamage: z.number(),
  abilityUses: z.record(z.string(), z.number()).optional(),
});
/** Private research state of one team. */
export type WireTeamResearch = z.infer<typeof WireTeamResearch>;

/**
 * Per-team research entry. `researching` is public (opponents show a shimmer); `research` is
 * private: the server strips it for every viewer but the owning team's controllers.
 */
export const WireTeamEntry = z.object({
  id: z.string(),
  researching: z.boolean().optional(),
  /** Completed tech ids (public; absent = none). */
  researched: z.array(z.string()).optional(),
  research: WireTeamResearch.optional(),
  /** Flags set by the team's completed techs (public: techs are revealed on completion). */
  flags: z.array(z.string()).optional(),
});
/** Per-team research entry. */
export type WireTeamEntry = z.infer<typeof WireTeamEntry>;

/** Compact authoritative snapshot (sent to display and controllers alike, ADR-0008). */
export const Snapshot = z.object({
  type: z.literal('snapshot'),
  tick: int.nonnegative(),
  /** `[strength (milli m/s^2), direction (mrad)]`. */
  wind: z.tuple([int, int]),
  /** Next turn's wind, same format; only sent to viewers with the Weather Vane (or Oracle). */
  nextWind: z.tuple([int, int]).optional(),
  /** `[activeTeamId, activeSnailId, phaseIndex, timeRemainingMs, turnNumber]`. */
  turn: z.tuple([z.string().nullable(), z.string().nullable(), int.nonnegative(), int, int]),
  snails: z.array(WireSnail),
  projectiles: z.array(WireProjectile),
  /** Active snail statuses (absent from older servers = none). */
  statuses: z.array(WireStatus).optional(),
  /** Lingering areas (absent from older servers = none). */
  areas: z.array(WireArea).optional(),
  /** Telegraphed delayed effects (absent from older servers = none). */
  scheduled: z.array(WireScheduled).optional(),
  /** Crates on the map (absent from older servers = none). */
  crates: z.array(WireCrate).optional(),
  /** Water surface height in mm; absent = the level announced in `matchStarted` (sudden death raises it). */
  water: int.optional(),
  /** Research preset; absent = off. */
  research: WireResearchSetting.optional(),
  /** Per-team research entries; absent = research off. */
  teams: z.array(WireTeamEntry).optional(),
});
/** Compact snapshot message. */
export type Snapshot = z.infer<typeof Snapshot>;

/** Vector in metres. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Decoded snail state. */
export interface SnailState {
  id: string;
  position: Vec3;
  velocity: Vec3;
  facing: number;
  health: number;
  state: SnailWireState;
  aim: { angle: number; power: number };
}

/** Decoded projectile state. */
export interface ProjectileState {
  id: string;
  weaponId: string;
  position: Vec3;
  velocity: Vec3;
}

/** Decoded snail status. */
export interface StatusState {
  snailId: string;
  statusId: string;
  turnsLeft: number;
  magnitude: number;
}

/** Decoded lingering area. */
export interface AreaState {
  id: string;
  kind: string;
  position: Vec3;
  radius: number;
  turnsLeft: number;
}

/** Decoded scheduled effect (a telegraphed strike or arrival). */
export interface ScheduledState {
  id: string;
  groupId: string;
  position: Vec3;
  radius: number;
  turnsLeft: number;
  style: 'strike' | 'arrival';
}

/** Decoded crate. */
export interface CrateState {
  id: string;
  defId: string;
  position: Vec3;
  /** True once resting on terrain; false while parachuting. */
  grounded: boolean;
}

/** Decoded snapshot (metres, seconds, radians). */
export interface DecodedSnapshot {
  tick: number;
  wind: { strength: number; direction: number };
  /** Next turn's wind (research on only). */
  nextWind?: { strength: number; direction: number };
  turn: {
    activeTeamId: string | null;
    activeSnailId: string | null;
    phase: WirePhase;
    timeRemaining: number;
    turnNumber: number;
  };
  snails: SnailState[];
  projectiles: ProjectileState[];
  statuses: StatusState[];
  areas: AreaState[];
  scheduled: ScheduledState[];
  crates: CrateState[];
  /** Water surface height in metres; absent = unchanged from the terrain parameters. */
  waterLevel?: number;
  /** Research preset; absent = off. */
  research?: z.infer<typeof WireResearchSetting>;
  /** Per-team research entries (private `research` only where the viewer may see it). */
  teams?: WireTeamEntry[];
}

const q = (v: number): number => Math.round(v * 1000);
const dq = (v: number): number => v / 1000;
const dv = (a: number, b: number, c: number): Vec3 => ({ x: dq(a), y: dq(b), z: dq(c) });

/** Quantises a snapshot into its compact wire message (positions to mm, angles to mrad). */
export function encodeSnapshot(s: DecodedSnapshot): Snapshot {
  return {
    type: 'snapshot',
    tick: s.tick,
    wind: [q(s.wind.strength), q(s.wind.direction)],
    ...(s.nextWind
      ? { nextWind: [q(s.nextWind.strength), q(s.nextWind.direction)] as [number, number] }
      : {}),
    turn: [
      s.turn.activeTeamId,
      s.turn.activeSnailId,
      Math.max(0, TURN_PHASES.indexOf(s.turn.phase)),
      q(s.turn.timeRemaining),
      s.turn.turnNumber,
    ],
    snails: s.snails.map((n) => [
      n.id,
      q(n.position.x),
      q(n.position.y),
      q(n.position.z),
      q(n.velocity.x),
      q(n.velocity.y),
      q(n.velocity.z),
      q(n.facing),
      n.health,
      Math.max(0, SNAIL_STATES.indexOf(n.state)),
      q(n.aim.angle),
      q(n.aim.power),
    ]),
    projectiles: s.projectiles.map((p) => [
      p.id,
      p.weaponId,
      q(p.position.x),
      q(p.position.y),
      q(p.position.z),
      q(p.velocity.x),
      q(p.velocity.y),
      q(p.velocity.z),
    ]),
    statuses: s.statuses.map((t) => [t.snailId, t.statusId, t.turnsLeft, q(t.magnitude)]),
    areas: s.areas.map((a) => [
      a.id,
      a.kind,
      q(a.position.x),
      q(a.position.y),
      q(a.position.z),
      q(a.radius),
      a.turnsLeft,
    ]),
    scheduled: s.scheduled.map(encodeScheduled),
    crates: s.crates.map(encodeCrate),
    ...(s.waterLevel === undefined ? {} : { water: q(s.waterLevel) }),
    ...(s.research === undefined ? {} : { research: s.research }),
    ...(s.teams === undefined ? {} : { teams: s.teams }),
  };
}

function encodeScheduled(e: ScheduledState): z.infer<typeof WireScheduled> {
  return [
    e.id,
    e.groupId,
    q(e.position.x),
    q(e.position.y),
    q(e.position.z),
    q(e.radius),
    e.turnsLeft,
    e.style === 'arrival' ? 1 : 0,
  ];
}

function encodeCrate(c: CrateState): z.infer<typeof WireCrate> {
  return [c.id, c.defId, q(c.position.x), q(c.position.y), q(c.position.z), c.grounded ? 1 : 0];
}

function decodeNextWind(m: Snapshot): Pick<DecodedSnapshot, 'nextWind'> {
  if (!m.nextWind) return {};
  return { nextWind: { strength: dq(m.nextWind[0]), direction: dq(m.nextWind[1]) } };
}

/** Expands a compact snapshot; unknown phase/state codes fall back to `intro`/`dead`. */
export function decodeSnapshot(m: Snapshot): DecodedSnapshot {
  const [team, snail, phase, time, turnNumber] = m.turn;
  return {
    tick: m.tick,
    wind: { strength: dq(m.wind[0]), direction: dq(m.wind[1]) },
    ...decodeNextWind(m),
    turn: {
      activeTeamId: team,
      activeSnailId: snail,
      phase: TURN_PHASES[phase] ?? 'intro',
      timeRemaining: dq(time),
      turnNumber,
    },
    snails: m.snails.map(([id, px, py, pz, vx, vy, vz, facing, health, state, angle, power]) => ({
      id,
      position: dv(px, py, pz),
      velocity: dv(vx, vy, vz),
      facing: dq(facing),
      health,
      state: SNAIL_STATES[state] ?? 'dead',
      aim: { angle: dq(angle), power: dq(power) },
    })),
    projectiles: m.projectiles.map(([id, weaponId, px, py, pz, vx, vy, vz]) => ({
      id,
      weaponId,
      position: dv(px, py, pz),
      velocity: dv(vx, vy, vz),
    })),
    statuses: (m.statuses ?? []).map(([snailId, statusId, turnsLeft, magnitude]) => ({
      snailId,
      statusId,
      turnsLeft,
      magnitude: dq(magnitude),
    })),
    areas: (m.areas ?? []).map(([id, kind, px, py, pz, radius, turnsLeft]) => ({
      id,
      kind,
      position: dv(px, py, pz),
      radius: dq(radius),
      turnsLeft,
    })),
    scheduled: (m.scheduled ?? []).map(([id, groupId, px, py, pz, radius, turnsLeft, style]) => ({
      id,
      groupId,
      position: dv(px, py, pz),
      radius: dq(radius),
      turnsLeft,
      style: style === 1 ? ('arrival' as const) : ('strike' as const),
    })),
    crates: (m.crates ?? []).map(([id, defId, px, py, pz, grounded]) => ({
      id,
      defId,
      position: dv(px, py, pz),
      grounded: grounded === 1,
    })),
    ...(m.water === undefined ? {} : { waterLevel: dq(m.water) }),
    ...(m.research === undefined ? {} : { research: m.research }),
    ...(m.teams === undefined ? {} : { teams: m.teams }),
  };
}
