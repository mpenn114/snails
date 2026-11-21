/** Structure-of-arrays particle storage; positions/colours are GPU-attribute backed. */
export interface ParticleData {
  /** Maximum simultaneous particles. */
  readonly capacity: number;
  /** xyz per particle. Dead particles are parked at {@link PARK_Y}. */
  readonly positions: Float32Array;
  /** rgb per particle, pre-multiplied by remaining life (fade to black). */
  readonly colours: Float32Array;
  /** Base rgb per particle (before fading). */
  readonly baseColours: Float32Array;
  /** xyz velocity per particle, m/s. */
  readonly velocities: Float32Array;
  /** Seconds lived. */
  readonly ages: Float32Array;
  /** Total lifetime in seconds; 0 marks a dead slot. */
  readonly lifetimes: Float32Array;
  /** Ring cursor for the next slot to recycle. */
  cursor: number;
}

/** Y coordinate dead particles are parked at (far below any scene). */
export const PARK_Y = -10000;

/** Physics parameters for a particle pool. */
export interface ParticlePhysics {
  /** Gravity acceleration (m/s^2, positive pulls down). */
  gravity: number;
  /** Per-second velocity damping factor (0 = none). */
  drag: number;
}

/** Parameters of one burst. */
export interface BurstSpec {
  /** Burst origin. */
  x: number;
  y: number;
  z: number;
  /** Number of particles to emit. */
  count: number;
  /** Min/max initial speed, m/s. */
  speedMin: number;
  speedMax: number;
  /** Min/max lifetime, s. */
  lifeMin: number;
  lifeMax: number;
  /** Base colour, 0xRRGGBB. */
  colour: number;
  /** Extra upward bias added to the outward direction (0 = isotropic). */
  upBias: number;
}

/** Allocates an empty pool (all slots dead). */
export function createParticleData(capacity: number): ParticleData {
  const positions = new Float32Array(capacity * 3);
  for (let i = 0; i < capacity; i++) positions[i * 3 + 1] = PARK_Y;
  return {
    capacity,
    positions,
    colours: new Float32Array(capacity * 3),
    baseColours: new Float32Array(capacity * 3),
    velocities: new Float32Array(capacity * 3),
    ages: new Float32Array(capacity),
    lifetimes: new Float32Array(capacity),
    cursor: 0,
  };
}

/** Number of live particles. */
export function aliveCount(data: ParticleData): number {
  let n = 0;
  for (let i = 0; i < data.capacity; i++) if ((data.lifetimes[i] ?? 0) > 0) n++;
  return n;
}

/** Emits a burst, recycling the oldest slots in ring order. `random` returns [0,1). */
export function spawnBurst(data: ParticleData, spec: BurstSpec, random: () => number): void {
  const r = ((spec.colour >> 16) & 255) / 255;
  const g = ((spec.colour >> 8) & 255) / 255;
  const b = (spec.colour & 255) / 255;
  for (let n = 0; n < spec.count; n++) {
    const i = data.cursor;
    data.cursor = (data.cursor + 1) % data.capacity;
    // Uniform direction on the sphere.
    const u = random() * 2 - 1;
    const phi = random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const speed = spec.speedMin + (spec.speedMax - spec.speedMin) * random();
    const k = i * 3;
    data.positions[k] = spec.x;
    data.positions[k + 1] = spec.y;
    data.positions[k + 2] = spec.z;
    data.velocities[k] = s * Math.cos(phi) * speed;
    data.velocities[k + 1] = (u + spec.upBias) * speed;
    data.velocities[k + 2] = s * Math.sin(phi) * speed;
    data.baseColours[k] = r;
    data.baseColours[k + 1] = g;
    data.baseColours[k + 2] = b;
    data.colours[k] = r;
    data.colours[k + 1] = g;
    data.colours[k + 2] = b;
    data.ages[i] = 0;
    data.lifetimes[i] = spec.lifeMin + (spec.lifeMax - spec.lifeMin) * random();
  }
}

/** Advances all live particles by `dt` seconds in place (no allocation). */
export function stepParticles(data: ParticleData, dt: number, physics: ParticlePhysics): void {
  const damp = Math.max(0, 1 - physics.drag * dt);
  for (let i = 0; i < data.capacity; i++) {
    const life = data.lifetimes[i] ?? 0;
    if (life <= 0) continue;
    const age = (data.ages[i] ?? 0) + dt;
    const k = i * 3;
    if (age >= life) {
      data.lifetimes[i] = 0;
      data.ages[i] = 0;
      data.positions[k + 1] = PARK_Y;
      data.colours[k] = 0;
      data.colours[k + 1] = 0;
      data.colours[k + 2] = 0;
      continue;
    }
    data.ages[i] = age;
    const vx = (data.velocities[k] ?? 0) * damp;
    const vy = (data.velocities[k + 1] ?? 0) * damp - physics.gravity * dt;
    const vz = (data.velocities[k + 2] ?? 0) * damp;
    data.velocities[k] = vx;
    data.velocities[k + 1] = vy;
    data.velocities[k + 2] = vz;
    data.positions[k] = (data.positions[k] ?? 0) + vx * dt;
    data.positions[k + 1] = (data.positions[k + 1] ?? 0) + vy * dt;
    data.positions[k + 2] = (data.positions[k + 2] ?? 0) + vz * dt;
    const fade = 1 - age / life;
    data.colours[k] = (data.baseColours[k] ?? 0) * fade;
    data.colours[k + 1] = (data.baseColours[k + 1] ?? 0) * fade;
    data.colours[k + 2] = (data.baseColours[k + 2] ?? 0) * fade;
  }
}
