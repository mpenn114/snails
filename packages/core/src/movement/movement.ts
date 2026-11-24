import { facingVector, findSnail, livingSnails } from '../entities/snail.js';
import { add, dot, normalize, scale, sub } from '../math/vec3.js';
import type { CommandHandler, SimContext, SystemFn } from '../sim/types.js';
import type { Snail, Vec3 } from '../state/types.js';
import { findGround, groundNormal, isSphereColliding, sphereSweep } from '../terrain/collision.js';
import type { ContentRegistry } from '../content/registry.js';
import type { StatusDefinition } from '../content/types.js';
import { statusMoveSpeedMultiplier } from '../status/status-system.js';
import { DEFAULT_MOVEMENT_CONFIG, type MovementConfig } from './movement-config.js';

const UP: Vec3 = { x: 0, y: 1, z: 0 };

/**
 * Stores the move/jump intent on the snail. Direction is relative to facing and never
 * turns the snail: +1 crawls forward, -1 crawls backward, 0 stops. A jump request is
 * sticky until the movement system consumes it. Unknown or dead snails are ignored.
 */
export const moveCommandHandler: CommandHandler<'move'> = (ctx, cmd) => {
  const snail = findSnail(ctx.state, cmd.snailId);
  if (!snail || !snail.alive) return;
  const pending = snail.moveIntent?.jumpRequested ?? false;
  snail.moveIntent = { direction: cmd.direction, jumpRequested: pending || cmd.jump === true };
};

/**
 * Creates the movement system: crawling on terrain, slope limiting, jumping, falling.
 * Emits `{ type: 'snailLanded', snailId, impactSpeed, fallDistance }` on touchdown.
 * With `statuses`, crawl speed is scaled by the snail's `moveSpeedMultiplier` statuses (jumps are not).
 * A jump goes along facing (scaled by direction; straight forward when direction is 0).
 */
export function movementSystem(
  config: MovementConfig = DEFAULT_MOVEMENT_CONFIG,
  statuses?: ContentRegistry<StatusDefinition>,
): SystemFn {
  return (ctx) => {
    for (const snail of livingSnails(ctx.state)) {
      if (snail.grounded === false) stepAirborne(ctx, snail, config);
      else {
        const slow = statuses ? statusMoveSpeedMultiplier(snail, statuses) : 1;
        stepGrounded(
          ctx,
          snail,
          slow === 1 ? config : { ...config, crawlSpeed: config.crawlSpeed * slow },
        );
      }
    }
  };
}

function startAirborne(snail: Snail, velocity: Vec3): void {
  snail.grounded = false;
  snail.velocity = velocity;
  snail.airborneFromY = snail.position.y;
}

function stepGrounded(ctx: SimContext, snail: Snail, cfg: MovementConfig): void {
  const intent = snail.moveIntent;
  const dir = intent?.direction ?? 0;
  if (intent?.jumpRequested) {
    intent.jumpRequested = false;
    const f = scale(facingVector(snail), dir === 0 ? 1 : dir);
    startAirborne(snail, {
      x: f.x * cfg.jumpForwardSpeed,
      y: cfg.jumpUpSpeed,
      z: f.z * cfg.jumpForwardSpeed,
    });
    return;
  }
  const heading = scale(facingVector(snail), dir);
  let candidate = snail.position;
  if (dir !== 0) {
    const n = groundNormal(ctx.terrain, snail.position);
    const tangent = normalize(sub(heading, scale(n, dot(heading, n))));
    candidate = add(snail.position, scale(tangent, cfg.crawlSpeed * ctx.dt));
  }
  const snapped = snapToGround(ctx, candidate, cfg);
  if (snapped?.ok) {
    snail.position = snapped.position;
  } else if (!snapped) {
    startAirborne(snail, scale(heading, cfg.crawlSpeed));
  } else {
    // Too steep or blocked: stay put, but keep tracking the ground under us.
    const here = snapToGround(ctx, snail.position, cfg);
    if (here?.ok) snail.position = here.position;
    else if (!here) startAirborne(snail, { x: 0, y: 0, z: 0 });
  }
}

interface Snap {
  position: Vec3;
  /** True when the slope is climbable and the sphere is free of terrain. */
  ok: boolean;
}

/** Finds the resting position above `p`; null if no ground within step height. */
function snapToGround(ctx: SimContext, p: Vec3, cfg: MovementConfig): Snap | null {
  const start = add(p, scale(UP, cfg.stepHeight + cfg.radius));
  if (isSphereColliding(ctx.terrain, start, cfg.radius * 0.7)) {
    return { position: p, ok: false };
  }
  const hit = findGround(ctx.terrain, start, 2 * cfg.stepHeight + 2 * cfg.radius);
  if (!hit) return null;
  const position = {
    x: hit.point.x,
    y: hit.point.y + cfg.radius / Math.max(hit.normal.y, 0.1),
    z: hit.point.z,
  };
  const slope = Math.acos(Math.min(1, Math.max(-1, dot(hit.normal, UP))));
  const blocked = isSphereColliding(ctx.terrain, position, cfg.radius * 0.7);
  return { position, ok: slope <= cfg.maxSlope && !blocked };
}

function stepAirborne(ctx: SimContext, snail: Snail, cfg: MovementConfig): void {
  if (snail.moveIntent) snail.moveIntent.jumpRequested = false;
  const v = { ...snail.velocity, y: snail.velocity.y - cfg.gravity * ctx.dt };
  const to = add(snail.position, scale(v, ctx.dt));
  const hit = sphereSweep(ctx.terrain, snail.position, to, cfg.radius);
  if (!hit || dot(v, hit.normal) >= 0) {
    snail.velocity = v;
    snail.position = to;
    return;
  }
  const fromY = snail.airborneFromY ?? snail.position.y;
  snail.position = hit.point;
  snail.velocity = { x: 0, y: 0, z: 0 };
  snail.grounded = true;
  delete snail.airborneFromY;
  const landing = {
    impactSpeed: Math.hypot(v.x, v.y, v.z),
    fallDistance: Math.max(0, fromY - hit.point.y),
  };
  snail.pendingLanding = landing;
  ctx.emit({ type: 'snailLanded', snailId: snail.id, ...landing });
}
