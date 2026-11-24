import * as THREE from 'three';
import type { ExplosionEvent, SimEvent } from '@snails/core';
import type { FrameUpdater } from '../render-loop.js';
import { createToonMaterial } from '../style/materials.js';
import { PALETTE } from '../style/palette.js';
import {
  FLASH_LIFE,
  blastCounts,
  debrisScale,
  flashOpacity,
  flashScale,
  pickDebrisColour,
  ringOpacity,
  ringRadius,
  ringScale,
  smokeAlpha,
  smokeColour,
  smokeScale,
} from './blast-params.js';
import { emitChunk, type ChunkPhysics } from './chunk-pool.js';
import { InstancedChunks } from './instanced-chunks.js';
import { SoftPuffs } from './soft-puffs.js';
import {
  aliveCount,
  createParticleData,
  spawnBurst,
  stepParticles,
  type ParticleData,
  type ParticlePhysics,
} from './particles.js';
import { createSoftSpriteTexture } from './soft-sprite.js';

/** Options for {@link ExplosionEffects}. */
export interface ExplosionEffectsOptions {
  /** Multiplier on element counts and pool sizes (tier `particleScale`; 0.25 on phones). Default 1. */
  quality?: number;
  /**
   * Max simultaneous flash lights (tier `maxDynamicLights`). 0 means no light at all (mobile);
   * the flash ball and dust ring still animate. Default 4.
   */
  maxLights?: number;
  /** Capacity of the spark pool at quality 1. Default 200. */
  poolCapacity?: number;
  /** Random source in [0,1); inject for tests and deterministic shots. Default Math.random. */
  random?: () => number;
}

/** Pool capacities at quality 1. */
const SMOKE_CAP = 64;
const DEBRIS_CAP = 96;

const SMOKE: ChunkPhysics = { gravity: -0.9, drag: 1.8, restitution: 0 };
const DEBRIS: ChunkPhysics = { gravity: 14, drag: 0.15, restitution: 0.45 };
const SPARKS: ParticlePhysics = { gravity: 9, drag: 0.8 };
/** Seconds the dust ring (and so the slot) lives; the flash ball and light end at FLASH_LIFE. */
const RING_LIFE = 0.55;

/** One reusable flash: optional light, flash ball and dust ring. */
interface FlashSlot {
  light: THREE.PointLight | null;
  ball: THREE.Mesh;
  ring: THREE.Mesh;
  age: number;
  radius: number;
  active: boolean;
}

const flashHot = new THREE.Color(PALETTE.uiPaper);
const flashWarm = new THREE.Color(PALETTE.uiAccent);

/** Additive spark pool backed by one THREE.Points. */
class SparkPool {
  readonly data: ParticleData;
  readonly points: THREE.Points;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.PointsMaterial;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;

  constructor(capacity: number, map: THREE.Texture) {
    this.data = createParticleData(capacity);
    this.posAttr = new THREE.BufferAttribute(this.data.positions, 3);
    this.colAttr = new THREE.BufferAttribute(this.data.colours, 3);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('color', this.colAttr);
    this.material = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      map,
      alphaTest: 0.02,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  advance(dt: number): void {
    stepParticles(this.data, dt, SPARKS);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}

/** Flash, puffy smoke, chunky debris, dust ring and sparks driven by explosion events. */
export class ExplosionEffects {
  /** Attach this to `roots.effects`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: advances effects by `dt`. */
  readonly updater: FrameUpdater;
  private readonly slots: FlashSlot[] = [];
  private lights = 0;
  private readonly smoke: SoftPuffs;
  private readonly cubes: InstancedChunks;
  private readonly wedges: InstancedChunks;
  private readonly sparks: SparkPool;
  private readonly sprite = createSoftSpriteTexture(32);
  private readonly ballGeo = new THREE.IcosahedronGeometry(1, 1);
  private readonly cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly wedgeGeo = new THREE.TetrahedronGeometry(0.8);
  private readonly ringGeo = new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2);
  private readonly debrisMat = createToonMaterial({ color: 0xffffff, flat: true });
  private readonly quality: number;
  private readonly random: () => number;
  private nextSlot = 0;
  private flip = false;

  /** Creates the pools and (invisible) flash slots. */
  constructor(opts: ExplosionEffectsOptions = {}) {
    this.quality = Math.max(0, opts.quality ?? 1);
    this.random = opts.random ?? Math.random;
    const q = Math.max(0.1, this.quality);
    const cap = (base: number): number => Math.max(8, Math.floor(base * q));
    this.group.name = 'explosions';
    this.smoke = new SoftPuffs(cap(SMOKE_CAP), SMOKE, {
      scale: smokeScale,
      colour: smokeColour,
      alpha: smokeAlpha,
    });
    this.cubes = new InstancedChunks(this.cubeGeo, this.debrisMat, cap(DEBRIS_CAP / 2), DEBRIS, {
      scale: debrisScale,
    });
    this.wedges = new InstancedChunks(this.wedgeGeo, this.debrisMat, cap(DEBRIS_CAP / 2), DEBRIS, {
      scale: debrisScale,
    });
    this.sparks = new SparkPool(cap(opts.poolCapacity ?? 200), this.sprite);
    this.group.add(this.smoke.mesh, this.cubes.mesh, this.wedges.mesh, this.sparks.points);
    this.lights = Math.max(0, Math.floor(opts.maxLights ?? 4));
    const n = Math.max(1, this.lights);
    for (let i = 0; i < n; i++) this.slots.push(this.makeSlot(i < this.lights));
    this.updater = (dt) => this.update(dt);
  }

  /** Number of flashes currently animating (never exceeds the slot count). */
  get activeFlashes(): number {
    return this.slots.filter((s) => s.active).length;
  }

  /** Number of live smoke, debris and spark particles. */
  get liveParticles(): number {
    return this.smoke.live + this.cubes.live + this.wedges.live + aliveCount(this.sparks.data);
  }

  /** Total flash lights (the cap on simultaneous dynamic lights; 0 on mobile). */
  get lightCap(): number {
    return this.slots.filter((s) => s.light).length;
  }

  /** Spawns effects for every explosion event in `events`. */
  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) if (e.type === 'explosion') this.spawn(e);
  }

  /** Spawns one explosion: flash, ring, smoke, debris and sparks scaled by radius. */
  spawn(e: ExplosionEvent): void {
    const radius = Math.max(0.1, e.radius);
    const slot = this.slots[this.nextSlot];
    if (!slot) return;
    this.nextSlot = (this.nextSlot + 1) % this.slots.length;
    this.startSlot(slot, e, radius);
    const n = blastCounts(radius, this.quality);
    this.spawnSmoke(e, radius, n.smoke);
    this.spawnDebris(e, radius, n.debris);
    this.spawnSparks(e, radius, n.sparks);
  }

  /** Advances flashes and particles by `dt` seconds. */
  update(dt: number): void {
    for (const s of this.slots) {
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= RING_LIFE) this.stopSlot(s);
      else this.updateSlot(s);
    }
    this.smoke.advance(dt);
    this.cubes.advance(dt);
    this.wedges.advance(dt);
    this.sparks.advance(dt);
  }

  /** Frees GPU resources and detaches from the scene. */
  dispose(): void {
    for (const s of this.slots) {
      (s.ball.material as THREE.Material).dispose();
      (s.ring.material as THREE.Material).dispose();
      s.light?.removeFromParent();
      s.ball.removeFromParent();
      s.ring.removeFromParent();
      s.light?.dispose();
    }
    this.slots.length = 0;
    for (const c of [this.smoke, this.cubes, this.wedges]) c.dispose();
    for (const g of [this.ballGeo, this.cubeGeo, this.wedgeGeo, this.ringGeo]) {
      g.dispose();
    }
    this.debrisMat.dispose();
    this.sprite.dispose();
    this.sparks.dispose();
    this.group.removeFromParent();
  }

  private spawnSmoke(e: ExplosionEvent, radius: number, count: number): void {
    const r = this.random;
    for (let i = 0; i < count; i++) {
      const phi = r() * Math.PI * 2;
      const out = radius * (0.1 + 0.55 * r());
      const speed = radius * (0.5 + 0.8 * r());
      emitChunk(this.smoke.pool, {
        x: e.position.x + Math.cos(phi) * out,
        y: e.position.y + radius * (0.05 + 0.25 * r()),
        z: e.position.z + Math.sin(phi) * out,
        vx: Math.cos(phi) * speed,
        vy: speed * (0.5 + r()),
        vz: Math.sin(phi) * speed,
        rx: 0,
        ry: 0,
        rz: 0,
        sx: 0,
        sy: 0,
        sz: 0,
        size: radius * (0.12 + 0.3 * r() * r()),
        colour: PALETTE.uiPaper,
        life: 1.1 + 0.8 * r(),
        floorY: 0,
      });
    }
  }

  private spawnDebris(e: ExplosionEvent, radius: number, count: number): void {
    const r = this.random;
    const grow = 0.8 + 0.05 * radius;
    for (let i = 0; i < count; i++) {
      this.flip = !this.flip;
      const phi = r() * Math.PI * 2;
      const speed = 2 + radius * (1.3 + 1.3 * r());
      const up = 0.45 + 0.55 * r();
      const side = Math.sqrt(1 - up * up);
      emitChunk((this.flip ? this.cubes : this.wedges).pool, {
        x: e.position.x,
        y: e.position.y + 0.1,
        z: e.position.z,
        vx: Math.cos(phi) * side * speed,
        vy: up * speed,
        vz: Math.sin(phi) * side * speed,
        rx: r() * 6,
        ry: r() * 6,
        rz: r() * 6,
        sx: (r() - 0.5) * 14,
        sy: (r() - 0.5) * 14,
        sz: (r() - 0.5) * 14,
        size: (0.1 + 0.2 * r()) * grow,
        colour: pickDebrisColour(r()),
        life: 1.1 + 0.6 * r(),
        floorY: e.position.y - radius * 0.35,
      });
    }
  }

  private spawnSparks(e: ExplosionEvent, radius: number, count: number): void {
    spawnBurst(
      this.sparks.data,
      {
        x: e.position.x,
        y: e.position.y + 0.2,
        z: e.position.z,
        count,
        speedMin: radius * 1.5,
        speedMax: radius * 3.5,
        lifeMin: 0.3,
        lifeMax: 0.6,
        colour: PALETTE.sunLight,
        upBias: 0.5,
      },
      this.random,
    );
  }

  private makeSlot(withLight: boolean): FlashSlot {
    const ballMat = new THREE.MeshBasicMaterial({
      color: PALETTE.uiPaper,
      transparent: true,
      depthWrite: false,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.haze,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ball = new THREE.Mesh(this.ballGeo, ballMat);
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ball.visible = false;
    ring.visible = false;
    this.group.add(ball, ring);
    let light: THREE.PointLight | null = null;
    if (withLight) {
      light = new THREE.PointLight(PALETTE.sunLight, 0, 1, 2);
      light.visible = false;
      this.group.add(light);
    }
    return { light, ball, ring, age: 0, radius: 1, active: false };
  }

  private startSlot(s: FlashSlot, e: ExplosionEvent, radius: number): void {
    s.active = true;
    s.age = 0;
    s.radius = radius;
    if (s.light) {
      s.light.position.set(e.position.x, e.position.y + radius * 0.4, e.position.z);
      s.light.distance = radius * 6;
      s.light.visible = true;
    }
    s.ball.position.set(e.position.x, e.position.y, e.position.z);
    s.ring.position.set(e.position.x, e.position.y + 0.12, e.position.z);
    s.ball.visible = true;
    s.ring.visible = true;
    this.updateSlot(s);
  }

  private stopSlot(s: FlashSlot): void {
    s.active = false;
    if (s.light) {
      s.light.visible = false;
      s.light.intensity = 0;
    }
    s.ball.visible = false;
    s.ring.visible = false;
  }

  private updateSlot(s: FlashSlot): void {
    const t = Math.min(1, s.age / FLASH_LIFE);
    const flashing = s.age < FLASH_LIFE;
    if (s.light) s.light.intensity = flashing ? s.radius * 20 * (1 - t) * (1 - t) : 0;
    s.ball.visible = flashing;
    const size = s.radius * flashScale(t);
    s.ball.scale.set(size, size, size);
    const ballMat = s.ball.material as THREE.MeshBasicMaterial;
    ballMat.opacity = flashOpacity(t);
    ballMat.color.lerpColors(flashHot, flashWarm, t);
    const u = s.age / RING_LIFE;
    const rs = ringRadius(s.radius) * ringScale(u);
    s.ring.scale.set(rs, 1, rs);
    (s.ring.material as THREE.MeshBasicMaterial).opacity = ringOpacity(u);
  }
}
