import { livingSnails } from '../entities/snail.js';
import type { SimContext, SystemFn } from '../sim/types.js';
import type { GameState, Snail, Vec3 } from '../state/types.js';
import { DEFAULT_MOVEMENT_CONFIG, type MovementConfig } from './movement-config.js';
import { snapToGround } from './movement.js';

const EPS = 1e-6;

/**
 * How far two snail spheres (radius `r` each) interpenetrate, measured as the horizontal
 * distance still missing to clear each other at their height difference. <= 0 means clear.
 */
export function snailPenetration(a: Vec3, b: Vec3, r: number): number {
  const dy = a.y - b.y;
  const need = Math.sqrt(Math.max(0, 4 * r * r - dy * dy));
  return need - Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * True when crawling `snail` to `to` would overlap another living snail more deeply than it
 * does now. Crawling away from (or sliding along) a neighbour is allowed, so snails never get stuck.
 */
export function crawlBlockedBySnail(state: GameState, snail: Snail, to: Vec3, r: number): boolean {
  for (const other of livingSnails(state)) {
    if (other === snail) continue;
    const after = snailPenetration(to, other.position, r);
    if (after > 0 && after > snailPenetration(snail.position, other.position, r)) return true;
  }
  return false;
}

/** Horizontal unit direction from b to a; ties (same column) break by id order, deterministic. */
function pushDirection(a: Snail, b: Snail): { x: number; z: number } {
  const dx = a.position.x - b.position.x;
  const dz = a.position.z - b.position.z;
  const h = Math.hypot(dx, dz);
  if (h > EPS) return { x: dx / h, z: dz / h };
  return a.id < b.id ? { x: -1, z: 0 } : { x: 1, z: 0 };
}

function tryShift(ctx: SimContext, s: Snail, dx: number, dz: number, cfg: MovementConfig): boolean {
  const to = { x: s.position.x + dx, y: s.position.y, z: s.position.z + dz };
  if (s.grounded === false) {
    s.position = to;
    return true;
  }
  const snap = snapToGround(ctx, to, cfg);
  if (!snap?.ok) return false;
  s.position = snap.position;
  return true;
}

function separatePair(ctx: SimContext, a: Snail, b: Snail, cfg: MovementConfig): void {
  const pen = snailPenetration(a.position, b.position, cfg.radius);
  if (pen <= EPS) return;
  const d = pushDirection(a, b);
  const half = pen / 2;
  const movedA = tryShift(ctx, a, d.x * half, d.z * half, cfg);
  const movedB = tryShift(ctx, b, -d.x * half, -d.z * half, cfg);
  // A snail pinned by terrain hands its share to the other one.
  if (!movedA && movedB) tryShift(ctx, b, -d.x * half, -d.z * half, cfg);
  if (!movedB && movedA) tryShift(ctx, a, d.x * half, d.z * half, cfg);
  for (const [s, sign] of [
    [a, 1],
    [b, -1],
  ] as const) {
    if (s.grounded !== false) continue;
    const into = s.velocity.x * d.x * sign + s.velocity.z * d.z * sign;
    if (into < 0)
      s.velocity = {
        ...s.velocity,
        x: s.velocity.x - into * d.x * sign,
        z: s.velocity.z - into * d.z * sign,
      };
  }
}

/**
 * Creates the snail separation system: after movement, overlapping living snails (a jump
 * landing on another snail, knockback into one, spawn or teleport overlap) are pushed apart
 * horizontally, half each (a snail pinned by terrain gives its share to the other), and an
 * airborne snail loses its velocity component into the other. Pairs are visited in team/snail
 * order, so the result is deterministic. Crawling itself is blocked in the movement system.
 */
export function snailSeparationSystem(config: MovementConfig = DEFAULT_MOVEMENT_CONFIG): SystemFn {
  return (ctx) => {
    const snails = livingSnails(ctx.state);
    for (let i = 0; i < snails.length; i++) {
      for (let j = i + 1; j < snails.length; j++) {
        separatePair(ctx, snails[i] as Snail, snails[j] as Snail, config);
      }
    }
  };
}
