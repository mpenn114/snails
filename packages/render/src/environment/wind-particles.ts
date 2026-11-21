import { DEFAULT_WIND_CONFIG } from '@snails/core';
import * as THREE from 'three';
import type { FrameUpdater } from '../render-loop.js';
import type { Bounds3 } from './lighting.js';

/** Metres per second of mote drift per unit of wind strength (m/s^2). */
export const WIND_PARTICLE_SPEED_SCALE = 0.5;
/** Largest per-axis jitter speed (m/s) added to each mote's own drift. */
export const WIND_PARTICLE_JITTER = 0.3;
/** Time constant (s) of the ease from the current wind toward a new one. */
export const WIND_EASE_TAU = 1.2;
/** Mote opacity with no wind (nearly invisible). */
export const WIND_OPACITY_MIN = 0.02;
/** Extra opacity added at full strength. */
export const WIND_OPACITY_RANGE = 0.5;
/** Fraction of the terrain height below which motes are not emitted. */
const PARTICLE_FLOOR_FRACTION = 0.3;

/**
 * Wind vector for a facing-convention direction (0 = +X, PI/2 = -Z) and strength (m/s^2).
 * Writes into `out` (a new vector by default).
 * @param direction - Wind direction in radians.
 * @param strength - Wind magnitude.
 * @param out - Optional vector to write into, to avoid allocation.
 */
export function windVector(
  direction: number,
  strength: number,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  return out.set(Math.cos(direction) * strength, 0, -Math.sin(direction) * strength);
}

/**
 * Box that motes fill and wrap within: the terrain's footprint, from a fraction of its height
 * up to the top of the bounds.
 * @param bounds - Terrain bounds.
 */
export function windParticleBox(bounds: Bounds3): Bounds3 {
  const h = bounds.max.y - bounds.min.y;
  return {
    min: new THREE.Vector3(bounds.min.x, bounds.min.y + h * PARTICLE_FLOOR_FRACTION, bounds.min.z),
    max: bounds.max.clone(),
  };
}

/** Wraps `v` into [lo, hi). */
function wrapAxis(v: number, lo: number, hi: number): number {
  const span = hi - lo;
  if (span <= 0) return lo;
  const m = (v - lo) % span;
  return lo + (m < 0 ? m + span : m);
}

/**
 * Places particles uniformly inside `box` with random per-particle jitter velocities.
 * @param positions - Flat xyz positions, written in place.
 * @param velocities - Flat xyz per-particle jitter velocities, written in place.
 * @param box - Emission box.
 * @param random - Source of numbers in [0, 1).
 */
export function scatterWindParticles(
  positions: Float32Array,
  velocities: Float32Array,
  box: Bounds3,
  random: () => number,
): void {
  for (let k = 0; k < positions.length; k += 3) {
    for (let a = 0; a < 3; a++) {
      const lo = box.min.getComponent(a);
      const hi = box.max.getComponent(a);
      positions[k + a] = lo + random() * (hi - lo);
      velocities[k + a] = (random() * 2 - 1) * WIND_PARTICLE_JITTER;
    }
  }
}

/**
 * Advances every particle by `dt` along `windVec` plus its own jitter, wrapping inside `bounds`.
 * Mutates `positions` in place.
 * @param positions - Flat xyz positions.
 * @param velocities - Flat xyz per-particle jitter velocities.
 * @param dt - Seconds to advance.
 * @param windVec - Drift velocity from the wind (m/s).
 * @param bounds - Box to wrap within.
 */
export function advanceWindParticles(
  positions: Float32Array,
  velocities: Float32Array,
  dt: number,
  windVec: THREE.Vector3,
  bounds: Bounds3,
): void {
  for (let k = 0; k < positions.length; k += 3) {
    for (let a = 0; a < 3; a++) {
      const v = positions[k + a]! + (windVec.getComponent(a) + velocities[k + a]!) * dt;
      positions[k + a] = wrapAxis(v, bounds.min.getComponent(a), bounds.max.getComponent(a));
    }
  }
}

/**
 * Eases `current` toward `target` with an exponential approach of time constant `tau`.
 * Mutates and returns `current`.
 * @param current - Eased wind, updated in place.
 * @param target - Wind to approach.
 * @param dt - Seconds elapsed.
 * @param tau - Time constant (s); zero or less snaps to the target.
 */
export function easeWindVector(
  current: THREE.Vector3,
  target: THREE.Vector3,
  dt: number,
  tau: number,
): THREE.Vector3 {
  const a = tau <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau);
  return current.lerp(target, a);
}

/**
 * Mote opacity for a wind speed: nearly invisible at zero, rising to full strength at
 * `maxStrength`.
 * @param strength - Current wind magnitude.
 * @param maxStrength - Strength that maps to full mote visibility.
 */
export function windOpacity(strength: number, maxStrength: number): number {
  const t = maxStrength > 0 ? Math.min(1, Math.max(0, strength / maxStrength)) : 0;
  return WIND_OPACITY_MIN + WIND_OPACITY_RANGE * t;
}

/** Options for {@link createWindParticles}. */
export interface WindParticlesOptions {
  /** Terrain bounds; motes fill the box above its floor and wrap inside it. */
  bounds: Bounds3;
  /** Number of motes. */
  count: number;
  /** Random source in [0, 1); defaults to `Math.random`. */
  random?: () => number;
  /** Wind strength that gives full mote visibility; defaults to the core max wind. */
  maxStrength?: number;
}

/** Drifting wind motes handle. */
export interface WindParticles {
  /** The points object to add to a scene. */
  readonly object: THREE.Points;
  /** Same as {@link WindParticles.object}. */
  readonly points: THREE.Points;
  /** Frame updater: reads the snapshot wind each frame and advances the motes. */
  readonly updater: FrameUpdater;
  /** Current number of motes. */
  readonly count: number;
  /** Eased wind vector currently driving the motes (m/s^2). */
  readonly wind: THREE.Vector3;
  /** Replaces the mote count, reseeding positions. */
  setCount(count: number): void;
  /** Sets the wind to ease toward, from the core convention. */
  setTarget(direction: number, strength: number): void;
  /** Advances the eased wind and the motes by `dt` seconds. */
  update(dt: number): void;
  /** Removes the points and frees GPU resources. */
  dispose(): void;
}

/** Dust-mote material, starting invisible (no wind). */
function createMoteMaterial(maxStrength: number): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    color: 0xf2e6c9,
    size: 0.12,
    transparent: true,
    opacity: windOpacity(0, maxStrength),
    depthWrite: false,
  });
}

/**
 * Creates drifting dust motes that are pushed by the wind and wrap inside the terrain box.
 * @param opts - Bounds, count and optional random source.
 */
export function createWindParticles(opts: WindParticlesOptions): WindParticles {
  const random = opts.random ?? Math.random;
  const maxStrength = opts.maxStrength ?? DEFAULT_WIND_CONFIG.maxStrength;
  const box = windParticleBox(opts.bounds);
  const target = new THREE.Vector3();
  const current = new THREE.Vector3();
  const scaled = new THREE.Vector3();
  const geometry = new THREE.BufferGeometry();
  const material = createMoteMaterial(maxStrength);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  let positions = new Float32Array(0);
  let velocities = new Float32Array(0);
  let attr = new THREE.BufferAttribute(positions, 3);

  function allocate(count: number): void {
    positions = new Float32Array(count * 3);
    velocities = new Float32Array(count * 3);
    scatterWindParticles(positions, velocities, box, random);
    attr = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute('position', attr);
  }

  function update(dt: number): void {
    easeWindVector(current, target, dt, WIND_EASE_TAU);
    scaled.copy(current).multiplyScalar(WIND_PARTICLE_SPEED_SCALE);
    advanceWindParticles(positions, velocities, dt, scaled, box);
    material.opacity = windOpacity(current.length(), maxStrength);
    attr.needsUpdate = true;
  }

  allocate(Math.max(0, Math.floor(opts.count)));
  material.opacity = windOpacity(0, maxStrength);

  return {
    object: points,
    points,
    updater: (dt, state) => {
      const wind = state?.snapshot.wind;
      if (wind) windVector(wind.direction, wind.strength, target);
      update(dt);
    },
    get count() {
      return positions.length / 3;
    },
    wind: current,
    setCount(count: number) {
      allocate(Math.max(0, Math.floor(count)));
      geometry.dispose();
    },
    setTarget(direction: number, strength: number) {
      windVector(direction, strength, target);
    },
    update,
    dispose() {
      points.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
