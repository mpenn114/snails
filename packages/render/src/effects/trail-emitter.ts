import { emitChunk, type ChunkPool } from './chunk-pool.js';

/** Per-projectile trail emission state. */
export interface TrailState {
  /** Whether `x,y,z` hold a previous sample. */
  hasLast: boolean;
  x: number;
  y: number;
  z: number;
  /** Distance travelled since the last puff, metres. */
  carry: number;
}

/** Fixed look of a trail. */
export interface TrailSpec {
  /** Metres between puffs. */
  spacing: number;
  /** Puff radius in metres. */
  size: number;
  /** Puff lifetime in seconds. */
  life: number;
  /** sRGB hex. */
  colour: number;
}

/** Most puffs one call may emit (a teleporting projectile must not flood the pool). */
const MAX_PER_CALL = 8;

/** Creates a state that has not seen a position yet. */
export function createTrailState(): TrailState {
  return { hasLast: false, x: 0, y: 0, z: 0, carry: 0 };
}

/**
 * Emits puffs evenly spaced along the path from the previous sample to `(x,y,z)`, so the trail
 * has no gaps however fast the projectile is. Pure and allocation free. Returns puffs emitted.
 */
export function emitTrail(
  pool: ChunkPool,
  st: TrailState,
  x: number,
  y: number,
  z: number,
  spec: TrailSpec,
): number {
  if (!st.hasLast) {
    st.hasLast = true;
    st.x = x;
    st.y = y;
    st.z = z;
    return 0;
  }
  const dx = x - st.x;
  const dy = y - st.y;
  const dz = z - st.z;
  const d = Math.hypot(dx, dy, dz);
  const total = st.carry + d;
  const n = Math.min(MAX_PER_CALL, Math.floor(total / spec.spacing));
  for (let k = 1; k <= n; k++) {
    const t = d > 0 ? Math.min(1, (k * spec.spacing - st.carry) / d) : 1;
    emitChunk(pool, {
      x: st.x + dx * t,
      y: st.y + dy * t,
      z: st.z + dz * t,
      vx: 0,
      vy: 0.25,
      vz: 0,
      rx: k * 1.3,
      ry: k * 0.7,
      rz: 0,
      sx: 0,
      sy: 0,
      sz: 0,
      size: spec.size,
      colour: spec.colour,
      life: spec.life,
      floorY: 0,
    });
  }
  st.carry = n === MAX_PER_CALL ? 0 : total - n * spec.spacing;
  st.x = x;
  st.y = y;
  st.z = z;
  return n;
}
