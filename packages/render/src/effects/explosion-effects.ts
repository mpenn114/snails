import * as THREE from 'three';
import type { ExplosionEvent, SimEvent } from '@snails/core';
import type { FrameUpdater } from '../render-loop.js';
import {
  aliveCount,
  createParticleData,
  spawnBurst,
  stepParticles,
  type ParticleData,
  type ParticlePhysics,
} from './particles.js';

/** Options for {@link ExplosionEffects}. */
export interface ExplosionEffectsOptions {
  /** Multiplier on particle counts (e.g. 0.4 on mobile). Default 1. */
  quality?: number;
  /** Max simultaneous flash lights / fireballs. Default 4. */
  maxLights?: number;
  /** Per-pool particle capacity at quality 1. Default 600. */
  poolCapacity?: number;
  /** Random source in [0,1); inject for tests. Default Math.random. */
  random?: () => number;
}

/** Seconds the flash light and fireball last. */
const FLASH_LIFE = 0.45;
const DEBRIS: ParticlePhysics = { gravity: 12, drag: 0.1 };
const DUST: ParticlePhysics = { gravity: 0.6, drag: 1.8 };

/** Particles of debris and dust emitted per metre of radius. */
const DEBRIS_PER_METRE = 14;
const DUST_PER_METRE = 10;

/** One reusable flash: light + fireball sphere. */
interface FlashSlot {
  light: THREE.PointLight;
  ball: THREE.Mesh;
  age: number;
  radius: number;
  active: boolean;
}

/** Pooled particle system backed by one THREE.Points. */
class ParticlePool {
  readonly data: ParticleData;
  readonly points: THREE.Points;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.PointsMaterial;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;

  constructor(
    capacity: number,
    size: number,
    readonly physics: ParticlePhysics,
  ) {
    this.data = createParticleData(capacity);
    this.posAttr = new THREE.BufferAttribute(this.data.positions, 3);
    this.colAttr = new THREE.BufferAttribute(this.data.colours, 3);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('color', this.colAttr);
    this.material = new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  advance(dt: number): void {
    stepParticles(this.data, dt, this.physics);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}

/** Flash light, fireball and debris/dust bursts driven by explosion events. */
export class ExplosionEffects {
  /** Attach this to `roots.effects`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: advances effects by `dt`. */
  readonly updater: FrameUpdater;
  private readonly slots: FlashSlot[] = [];
  private readonly debris: ParticlePool;
  private readonly dust: ParticlePool;
  private readonly fireGeo = new THREE.SphereGeometry(1, 14, 10);
  private readonly quality: number;
  private readonly random: () => number;
  private nextSlot = 0;

  /** Creates the pools and (invisible) flash slots. */
  constructor(opts: ExplosionEffectsOptions = {}) {
    this.quality = Math.max(0, opts.quality ?? 1);
    this.random = opts.random ?? Math.random;
    const cap = Math.max(1, Math.floor((opts.poolCapacity ?? 600) * Math.max(0.1, this.quality)));
    this.group.name = 'explosions';
    this.debris = new ParticlePool(cap, 0.28, DEBRIS);
    this.dust = new ParticlePool(cap, 0.7, DUST);
    this.group.add(this.debris.points, this.dust.points);
    const lights = Math.max(1, Math.floor(opts.maxLights ?? 4));
    for (let i = 0; i < lights; i++) this.slots.push(this.makeSlot());
    this.updater = (dt) => this.update(dt);
  }

  /** Number of flashes currently animating (never exceeds the light cap). */
  get activeFlashes(): number {
    return this.slots.filter((s) => s.active).length;
  }

  /** Number of live debris + dust particles. */
  get liveParticles(): number {
    return aliveCount(this.debris.data) + aliveCount(this.dust.data);
  }

  /** Total light slots (the cap on simultaneous flash lights). */
  get lightCap(): number {
    return this.slots.length;
  }

  /** Spawns effects for every explosion event in `events`. */
  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) if (e.type === 'explosion') this.spawn(e);
  }

  /** Spawns one explosion: flash, fireball and particle bursts scaled by radius. */
  spawn(e: ExplosionEvent): void {
    const radius = Math.max(0.1, e.radius);
    const slot = this.slots[this.nextSlot];
    if (!slot) return;
    this.nextSlot = (this.nextSlot + 1) % this.slots.length;
    slot.active = true;
    slot.age = 0;
    slot.radius = radius;
    slot.light.position.set(e.position.x, e.position.y + radius * 0.3, e.position.z);
    slot.light.distance = radius * 6;
    slot.light.visible = true;
    slot.ball.position.set(e.position.x, e.position.y, e.position.z);
    slot.ball.visible = true;
    this.updateSlot(slot);
    const base = { x: e.position.x, y: e.position.y, z: e.position.z, upBias: 0.4 };
    const debrisN = Math.round(radius * DEBRIS_PER_METRE * this.quality);
    const dustN = Math.round(radius * DUST_PER_METRE * this.quality);
    spawnBurst(
      this.debris.data,
      {
        ...base,
        count: debrisN,
        speedMin: radius * 1.5,
        speedMax: radius * 4,
        lifeMin: 0.8,
        lifeMax: 1.6,
        colour: 0x6b4a2b,
      },
      this.random,
    );
    spawnBurst(
      this.dust.data,
      {
        ...base,
        upBias: 0.1,
        count: dustN,
        speedMin: radius * 0.5,
        speedMax: radius * 1.8,
        lifeMin: 0.6,
        lifeMax: 1.4,
        colour: 0xb59b78,
      },
      this.random,
    );
  }

  /** Advances flashes and particles by `dt` seconds. */
  update(dt: number): void {
    for (const s of this.slots) {
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= FLASH_LIFE) {
        s.active = false;
        s.light.visible = false;
        s.light.intensity = 0;
        s.ball.visible = false;
      } else this.updateSlot(s);
    }
    this.debris.advance(dt);
    this.dust.advance(dt);
  }

  /** Frees GPU resources and detaches from the scene. */
  dispose(): void {
    for (const s of this.slots) {
      (s.ball.material as THREE.Material).dispose();
      s.light.removeFromParent();
      s.ball.removeFromParent();
      s.light.dispose();
    }
    this.slots.length = 0;
    this.fireGeo.dispose();
    this.debris.dispose();
    this.dust.dispose();
    this.group.removeFromParent();
  }

  private makeSlot(): FlashSlot {
    const light = new THREE.PointLight(0xffb060, 0, 1, 2);
    light.visible = false;
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffa040,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ball = new THREE.Mesh(this.fireGeo, mat);
    ball.visible = false;
    this.group.add(light, ball);
    return { light, ball, age: 0, radius: 1, active: false };
  }

  private updateSlot(s: FlashSlot): void {
    const t = s.age / FLASH_LIFE;
    const fade = 1 - t;
    s.light.intensity = s.radius * 40 * fade * fade;
    const size = s.radius * (0.35 + 0.65 * Math.sqrt(t));
    s.ball.scale.set(size, size, size);
    (s.ball.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
  }
}
