/** Structure-of-arrays pool of small physical chunks (smoke balls, debris, trail puffs). */
export interface ChunkPool {
  /** Maximum simultaneous chunks. */
  readonly capacity: number;
  /** xyz per chunk. */
  readonly pos: Float32Array;
  /** xyz velocity per chunk, m/s. */
  readonly vel: Float32Array;
  /** Euler xyz rotation per chunk, radians. */
  readonly rot: Float32Array;
  /** Euler xyz spin per chunk, rad/s. */
  readonly spin: Float32Array;
  /** Final size (radius or half edge) in metres. */
  readonly size: Float32Array;
  /** Base sRGB rgb per chunk, 0..1. */
  readonly colour: Float32Array;
  /** Seconds lived. */
  readonly age: Float32Array;
  /** Lifetime in seconds; 0 marks a dead slot. */
  readonly life: Float32Array;
  /** Floor height each chunk bounces on. */
  readonly floorY: Float32Array;
  /** Bounces done so far. */
  readonly bounces: Uint8Array;
  /** Ring cursor of the next slot to recycle. */
  cursor: number;
}

/** Physics of one pool. */
export interface ChunkPhysics {
  /** Gravity m/s^2 (positive falls, negative rises, e.g. buoyant smoke). */
  gravity: number;
  /** Per-second velocity damping. */
  drag: number;
  /** Bounce restitution against `floorY`; 0 disables the floor. One bounce, then it rests. */
  restitution: number;
}

/** One chunk to emit. */
export interface ChunkSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Initial Euler rotation. */
  rx: number;
  ry: number;
  rz: number;
  /** Spin rates. */
  sx: number;
  sy: number;
  sz: number;
  size: number;
  /** sRGB hex, 0xRRGGBB. */
  colour: number;
  life: number;
  floorY: number;
}

/** Allocates an empty pool. */
export function createChunkPool(capacity: number): ChunkPool {
  const n = Math.max(1, Math.floor(capacity));
  return {
    capacity: n,
    pos: new Float32Array(n * 3),
    vel: new Float32Array(n * 3),
    rot: new Float32Array(n * 3),
    spin: new Float32Array(n * 3),
    size: new Float32Array(n),
    colour: new Float32Array(n * 3),
    age: new Float32Array(n),
    life: new Float32Array(n),
    floorY: new Float32Array(n),
    bounces: new Uint8Array(n),
    cursor: 0,
  };
}

/** Number of live chunks. */
export function chunkCount(pool: ChunkPool): number {
  let n = 0;
  for (let i = 0; i < pool.capacity; i++) if ((pool.life[i] ?? 0) > 0) n++;
  return n;
}

/** Emits a chunk into the oldest ring slot (recycling when full). Returns the slot index. */
export function emitChunk(pool: ChunkPool, s: ChunkSpec): number {
  const i = pool.cursor;
  pool.cursor = (pool.cursor + 1) % pool.capacity;
  const k = i * 3;
  pool.pos[k] = s.x;
  pool.pos[k + 1] = s.y;
  pool.pos[k + 2] = s.z;
  pool.vel[k] = s.vx;
  pool.vel[k + 1] = s.vy;
  pool.vel[k + 2] = s.vz;
  pool.rot[k] = s.rx;
  pool.rot[k + 1] = s.ry;
  pool.rot[k + 2] = s.rz;
  pool.spin[k] = s.sx;
  pool.spin[k + 1] = s.sy;
  pool.spin[k + 2] = s.sz;
  pool.size[i] = s.size;
  pool.colour[k] = ((s.colour >> 16) & 255) / 255;
  pool.colour[k + 1] = ((s.colour >> 8) & 255) / 255;
  pool.colour[k + 2] = (s.colour & 255) / 255;
  pool.age[i] = 0;
  pool.life[i] = Math.max(1e-3, s.life);
  pool.floorY[i] = s.floorY;
  pool.bounces[i] = 0;
  return i;
}

/** Applies a floor bounce to slot `i` whose y is below its floor. */
function bounce(pool: ChunkPool, i: number, restitution: number): void {
  const k = i * 3;
  pool.pos[k + 1] = pool.floorY[i] ?? 0;
  if ((pool.bounces[i] ?? 0) === 0) {
    pool.vel[k] = (pool.vel[k] ?? 0) * 0.6;
    pool.vel[k + 1] = -(pool.vel[k + 1] ?? 0) * restitution;
    pool.vel[k + 2] = (pool.vel[k + 2] ?? 0) * 0.6;
    pool.bounces[i] = 1;
    return;
  }
  pool.vel.fill(0, k, k + 3);
  pool.spin.fill(0, k, k + 3);
}

/** Advances every live chunk by `dt` seconds in place (no allocation). */
export function stepChunks(pool: ChunkPool, dt: number, phys: ChunkPhysics): void {
  const damp = Math.max(0, 1 - phys.drag * dt);
  for (let i = 0; i < pool.capacity; i++) {
    const life = pool.life[i] ?? 0;
    if (life <= 0) continue;
    const age = (pool.age[i] ?? 0) + dt;
    if (age >= life) {
      pool.life[i] = 0;
      pool.age[i] = 0;
      continue;
    }
    pool.age[i] = age;
    const k = i * 3;
    pool.vel[k] = (pool.vel[k] ?? 0) * damp;
    pool.vel[k + 1] = (pool.vel[k + 1] ?? 0) * damp - phys.gravity * dt;
    pool.vel[k + 2] = (pool.vel[k + 2] ?? 0) * damp;
    for (let a = 0; a < 3; a++) {
      pool.pos[k + a] = (pool.pos[k + a] ?? 0) + (pool.vel[k + a] ?? 0) * dt;
      pool.rot[k + a] = (pool.rot[k + a] ?? 0) + (pool.spin[k + a] ?? 0) * dt;
    }
    const falling = (pool.vel[k + 1] ?? 0) <= 0;
    if (phys.restitution > 0 && falling && (pool.pos[k + 1] ?? 0) < (pool.floorY[i] ?? 0)) {
      bounce(pool, i, phys.restitution);
    }
  }
}
