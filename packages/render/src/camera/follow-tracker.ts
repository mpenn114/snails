import type { GameSnapshot } from '@snails/core';
import { facingFromVelocity, type Point3 } from './camera-pose.js';

/** What the follow camera should look at. */
export interface FollowFocus {
  point: Point3;
  /** Facing to sit behind, or null to keep the current heading. */
  facing: number | null;
  kind: 'snail' | 'projectile' | 'explosion';
}

/** Tunables for the tracker. */
export interface FollowTrackerOptions {
  /** Seconds to linger on the last projectile position after it vanishes. */
  explosionHold: number;
  /** Height above a snail's position to look at. */
  snailLookHeight: number;
}

/**
 * Chooses the follow focus: in-flight projectile, then the explosion point briefly, then the
 * active snail. Reads snapshots only.
 */
export class FollowTracker {
  private lastProjectile: Point3 | null = null;
  private lastFacing: number | null = null;
  private hold = 0;

  constructor(private readonly opts: FollowTrackerOptions) {}

  /** Advances the hold timer and returns the focus, or null if nothing is trackable. */
  update(dt: number, snapshot: GameSnapshot | null): FollowFocus | null {
    if (!snapshot) return null;
    let shot: GameSnapshot['projectiles'][number] | null = null;
    for (const p of snapshot.projectiles) if (shot === null || p.age > shot.age) shot = p;
    if (shot) {
      this.lastProjectile = { ...shot.position };
      this.lastFacing = facingFromVelocity(shot.velocity.x, shot.velocity.z);
      this.hold = this.opts.explosionHold;
      return { point: { ...shot.position }, facing: this.lastFacing, kind: 'projectile' };
    }
    if (this.lastProjectile && this.hold > 0) {
      this.hold -= dt;
      if (this.hold > 0) {
        return { point: { ...this.lastProjectile }, facing: this.lastFacing, kind: 'explosion' };
      }
    }
    this.lastProjectile = null;
    return this.activeSnailFocus(snapshot);
  }

  private activeSnailFocus(snapshot: GameSnapshot): FollowFocus | null {
    const id = snapshot.turn.activeSnailId;
    for (const team of snapshot.teams) {
      const s = team.snails.find((x) => x.id === id);
      if (s) {
        const p = s.position;
        return {
          point: { x: p.x, y: p.y + this.opts.snailLookHeight, z: p.z },
          facing: s.facing,
          kind: 'snail',
        };
      }
    }
    return null;
  }
}
