import { FIXED_DT } from '@snails/core';
import type { GameSnapshot, Projectile, Snail, Vec3 } from '@snails/core';
import type { RenderState, RenderStateSource } from './render-loop.js';

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolates between two angles (radians) along the shortest arc. */
export function lerpAngle(a: number, b: number, t: number): number {
  const twoPi = Math.PI * 2;
  let d = (b - a) % twoPi;
  if (d > Math.PI) d -= twoPi;
  else if (d < -Math.PI) d += twoPi;
  return a + d * t;
}

/** Component-wise Vec3 interpolation. */
export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

/** Teleport threshold: positions further apart than this (metres) snap instead of lerp. */
export const SNAP_DISTANCE = 20;

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Interpolates one snail pair; health is held at the earlier value until alpha reaches 1. */
export function interpolateSnail(a: Snail, b: Snail, t: number): Snail {
  if (dist(a.position, b.position) > SNAP_DISTANCE) return t < 1 ? a : b;
  return {
    ...b,
    position: lerpVec3(a.position, b.position, t),
    facing: lerpAngle(a.facing, b.facing, t),
    health: t < 1 ? a.health : b.health,
  };
}

/** Interpolates one projectile pair. */
export function interpolateProjectile(a: Projectile, b: Projectile, t: number): Projectile {
  return { ...b, position: lerpVec3(a.position, b.position, t) };
}

function blendById<T extends { id: string }>(
  prev: readonly T[],
  next: readonly T[],
  t: number,
  blend: (a: T, b: T, t: number) => T,
): T[] {
  const before = new Map(prev.map((e) => [e.id, e]));
  // Entities only in `next` appear at once; ones only in `prev` are dropped (no lerp).
  return next.map((n) => {
    const p = before.get(n.id);
    return p ? blend(p, n, t) : n;
  });
}

/**
 * Pure blend of two snapshots at `alpha` (0 = prev, 1 = next). Non-render fields come from
 * `next`; snails/projectiles are matched by id.
 */
export function interpolateSnapshots(
  prev: GameSnapshot,
  next: GameSnapshot,
  alpha: number,
): GameSnapshot {
  const t = Math.min(1, Math.max(0, alpha));
  return {
    ...next,
    teams: next.teams.map((team) => {
      const old = prev.teams.find((o) => o.id === team.id);
      return old
        ? { ...team, snails: blendById(old.snails, team.snails, t, interpolateSnail) }
        : team;
    }),
    projectiles: blendById(prev.projectiles, next.projectiles, t, interpolateProjectile),
  };
}

/** Render state with the bracketing snapshots; `snapshot` is the blended view. */
export interface InterpolatedView extends RenderState {
  /** Earlier bracketing snapshot. */
  prev: GameSnapshot;
  /** Later bracketing snapshot (same as `prev` when holding). */
  next: GameSnapshot;
}

/** Options for {@link SnapshotBuffer}. */
export interface SnapshotBufferOptions {
  /** Clock in milliseconds. */
  now: () => number;
  /** Interpolation delay in ticks (default 2). */
  delayTicks?: number;
  /** Max snapshots kept (default 8). */
  capacity?: number;
  /** Duration of one tick in ms (default FIXED_DT). */
  tickMs?: number;
  /** Tick gap above which the view snaps to the newest snapshot (default 30). */
  snapGapTicks?: number;
}

/** Bounded, tick-ordered snapshot ring that yields interpolated render state. */
export class SnapshotBuffer implements RenderStateSource {
  private snaps: GameSnapshot[] = [];
  private newestArrival = 0;
  private readonly now: () => number;
  private readonly delayTicks: number;
  private readonly capacity: number;
  private readonly tickMs: number;
  private readonly snapGapTicks: number;

  constructor(options: SnapshotBufferOptions) {
    this.now = options.now;
    this.delayTicks = options.delayTicks ?? 2;
    this.capacity = Math.max(2, options.capacity ?? 8);
    this.tickMs = options.tickMs ?? FIXED_DT * 1000;
    this.snapGapTicks = options.snapGapTicks ?? 30;
  }

  /** Number of buffered snapshots. */
  get size(): number {
    return this.snaps.length;
  }

  /** Adds a snapshot; duplicates (same tick) and snapshots older than the newest are dropped. */
  push(snapshot: GameSnapshot): boolean {
    const newest = this.snaps[this.snaps.length - 1];
    if (newest && snapshot.tick <= newest.tick) return false;
    this.snaps.push(snapshot);
    if (this.snaps.length > this.capacity) this.snaps.shift();
    this.newestArrival = this.now();
    return true;
  }

  /** Clears all snapshots (e.g. on new match). */
  reset(): void {
    this.snaps = [];
  }

  /** Interpolated view for the current clock time, or null when empty. */
  getView(): InterpolatedView | null {
    const newest = this.snaps[this.snaps.length - 1];
    if (!newest) return null;
    const renderTick =
      newest.tick + (this.now() - this.newestArrival) / this.tickMs - this.delayTicks;
    const first = this.snaps[0] as GameSnapshot;
    if (renderTick >= newest.tick) return hold(newest);
    if (renderTick <= first.tick) return hold(first);
    let i = this.snaps.length - 1;
    while (i > 0 && (this.snaps[i - 1] as GameSnapshot).tick >= renderTick) i--;
    const prev = this.snaps[i - 1] as GameSnapshot;
    const next = this.snaps[i] as GameSnapshot;
    if (next.tick - prev.tick > this.snapGapTicks) return hold(next);
    const alpha = (renderTick - prev.tick) / (next.tick - prev.tick);
    return { snapshot: interpolateSnapshots(prev, next, alpha), alpha, prev, next };
  }

  /** {@link RenderStateSource} adapter. */
  getState(): InterpolatedView | null {
    return this.getView();
  }
}

function hold(s: GameSnapshot): InterpolatedView {
  return { snapshot: s, alpha: 1, prev: s, next: s };
}
