import type { GameState, Shell, Snail, Vec3 } from '../state/types.js';

/** Default health (and max health) for a newly created snail. */
export const DEFAULT_SNAIL_HEALTH = 100;

/** Options for `createSnail`. Only `id`, `teamId` and `name` are required. */
export interface SnailOptions {
  id: string;
  teamId: string;
  name: string;
  position?: Vec3;
  /** Maximum health; defaults to `DEFAULT_SNAIL_HEALTH`. */
  maxHealth?: number;
  /** Starting health; defaults to `maxHealth`. Clamped to [0, maxHealth]. */
  health?: number;
  /** Facing in radians, see `facingVector`; defaults to 0. */
  facing?: number;
  /** Shell; defaults to no upgrade with `colour`. */
  shell?: Shell;
  /** Colour used for the default shell when `shell` is not given. */
  colour?: string;
}

/** Result of `applyDamage`. */
export interface DamageResult {
  /** Health actually removed (never more than the snail's remaining health). */
  dealt: number;
  /** True only if this call took the snail from alive to dead. */
  killed: boolean;
}

/**
 * Creates a fresh, living snail at rest.
 * Position and shell are copied, so the caller's objects are never aliased.
 */
export function createSnail(opts: SnailOptions): Snail {
  const maxHealth = opts.maxHealth ?? DEFAULT_SNAIL_HEALTH;
  const health = clamp(opts.health ?? maxHealth, 0, maxHealth);
  const shell: Shell = opts.shell
    ? { upgradeId: opts.shell.upgradeId, colour: opts.shell.colour }
    : { upgradeId: null, colour: opts.colour ?? '' };
  return {
    id: opts.id,
    teamId: opts.teamId,
    name: opts.name,
    position: { ...(opts.position ?? { x: 0, y: 0, z: 0 }) },
    velocity: { x: 0, y: 0, z: 0 },
    facing: normaliseAngle(opts.facing ?? 0),
    health,
    maxHealth,
    alive: health > 0,
    shell,
    moveIntent: { direction: 0, jumpRequested: false },
    grounded: true,
  };
}

/**
 * Applies damage in place. Ignores dead snails and non-positive or non-finite amounts.
 * Health clamps at 0; reaching 0 marks the snail dead.
 */
export function applyDamage(snail: Snail, amount: number): DamageResult {
  if (!snail.alive || !(amount > 0) || !Number.isFinite(amount)) {
    return { dealt: 0, killed: false };
  }
  const dealt = Math.min(snail.health, amount);
  snail.health = Math.max(0, snail.health - dealt);
  if (snail.health <= 0) {
    snail.alive = false;
    return { dealt, killed: true };
  }
  return { dealt, killed: false };
}

/**
 * Heals in place, clamped to `maxHealth`. Dead snails cannot be healed; non-positive
 * or non-finite amounts are ignored. Returns the health actually restored.
 */
export function heal(snail: Snail, amount: number): number {
  if (!snail.alive || !(amount > 0) || !Number.isFinite(amount)) return 0;
  const before = snail.health;
  snail.health = Math.min(snail.maxHealth, snail.health + amount);
  return snail.health - before;
}

/** Kills the snail in place: health 0, alive false. */
export function kill(snail: Snail): void {
  snail.health = 0;
  snail.alive = false;
}

/**
 * Sets facing in place, normalised to [-PI, PI). Non-finite angles are ignored.
 */
export function setFacing(snail: Snail, radians: number): void {
  if (!Number.isFinite(radians)) return;
  snail.facing = normaliseAngle(radians);
}

/**
 * Yaw (radians) that turns a snail at `from` to face `to`, using the `facingVector` convention.
 * Only the XZ components are used.
 */
export function facingToward(from: Vec3, to: Vec3): number {
  return Math.atan2(-(to.z - from.z), to.x - from.x);
}

/**
 * Unit direction the snail faces, in the XZ plane (+Y up).
 * Convention: facing 0 is +X; the angle is a right-handed rotation about +Y,
 * so facing PI/2 is -Z. The result is `{ x: cos f, y: 0, z: -sin f }`.
 */
export function facingVector(snail: Snail): Vec3 {
  return { x: Math.cos(snail.facing), y: 0, z: -Math.sin(snail.facing) };
}

/** Finds a snail by id across all teams, or `undefined` if absent. */
export function findSnail(state: GameState, id: string): Snail | undefined {
  for (const team of state.teams) {
    const snail = team.snails.find((s) => s.id === id);
    if (snail) return snail;
  }
  return undefined;
}

/** All living snails, in team order then snail order. */
export function livingSnails(state: GameState): Snail[] {
  return state.teams.flatMap((team) => team.snails.filter((s) => s.alive));
}

/** Living snails of one team, in snail order. Empty if the team is unknown. */
export function livingSnailsOfTeam(state: GameState, teamId: string): Snail[] {
  const team = state.teams.find((t) => t.id === teamId);
  return team ? team.snails.filter((s) => s.alive) : [];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Wraps an angle into [-PI, PI). */
function normaliseAngle(radians: number): number {
  const twoPi = 2 * Math.PI;
  const wrapped = (((radians + Math.PI) % twoPi) + twoPi) % twoPi;
  return wrapped - Math.PI;
}
