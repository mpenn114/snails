import * as THREE from 'three';
import { emitChunk, type ChunkPhysics } from '../effects/chunk-pool.js';
import { InstancedChunks } from '../effects/instanced-chunks.js';
import { SoftPuffs } from '../effects/soft-puffs.js';
import type { QualityTier } from '../quality.js';
import { crackStateFor } from './crack-damage.js';

/** Fewest fragments shed when a hit crosses a crack threshold. */
export const MIN_CROSSING_FRAGMENTS = 3;
/** Most fragments shed when a hit crosses a crack threshold. */
export const MAX_CROSSING_FRAGMENTS = 8;
/** Fragment fall and fade time (s). */
export const FRAGMENT_LIFE = 4;
/** Fragment pool capacity. */
export const FRAGMENT_CAPACITY = 96;
/** Smoke puff pool capacity. */
export const SMOKE_CAPACITY = 24;
/** Mean seconds between smoke wisps of one critical snail. */
export const SMOKE_INTERVAL = 1.6;

/**
 * Fragments shed when health goes from ratio `prev` to `next`: 0 when the crack state is
 * unchanged (or health rose), otherwise 3-8 scaling with the ratio lost.
 */
export function crossingFragmentCount(prev: number, next: number): number {
  if (next >= prev || crackStateFor(prev) === crackStateFor(next)) return 0;
  const lost = Math.min(1, prev - next);
  const span = MAX_CROSSING_FRAGMENTS - MIN_CROSSING_FRAGMENTS;
  return Math.min(MAX_CROSSING_FRAGMENTS, MIN_CROSSING_FRAGMENTS + Math.round(lost * span * 3));
}

/** Fragments shed by an ordinary hit of `amount` against `maxHealth`: 0-2. */
export function hitFragmentCount(amount: number, maxHealth: number): number {
  if (!(maxHealth > 0) || amount <= 0) return 0;
  const f = amount / maxHealth;
  return f < 0.04 ? 0 : f < 0.15 ? 1 : 2;
}

/** Whether a tier spawns shell fragments (off on low and mobile). */
export function tierSpawnsFragments(tier: QualityTier): boolean {
  return tier === 'high' || tier === 'medium';
}

const FRAG_PHYS: ChunkPhysics = { gravity: 9, drag: 0.4, restitution: 0.3 };
const SMOKE_PHYS: ChunkPhysics = { gravity: -0.5, drag: 0.8, restitution: 0 };

/** Pooled shell fragments and critical-state smoke wisps, with fixed caps. */
export class ShellDebris {
  /** Attach to the scene. */
  readonly group = new THREE.Group();
  private readonly frags: InstancedChunks;
  private readonly smoke: SoftPuffs;
  private readonly geo = new THREE.TetrahedronGeometry(1);
  private readonly mat = new THREE.MeshLambertMaterial();
  private readonly timers = new Map<string, number>();

  /** Creates the pools; low/mobile tiers disable fragments (smoke stays). */
  constructor(
    private readonly tier: QualityTier,
    private readonly random: () => number = Math.random,
  ) {
    this.group.name = 'shell-debris';
    this.frags = new InstancedChunks(this.geo, this.mat, FRAGMENT_CAPACITY, FRAG_PHYS, {
      scale: (t) => 1 - t * t,
    });
    this.smoke = new SoftPuffs(SMOKE_CAPACITY, SMOKE_PHYS, {
      scale: (t) => 0.5 + t,
      alpha: (t) => 0.35 * (1 - t),
      colour: (_t, out) => out.fill(0.25),
    });
    this.group.add(this.frags.mesh, this.smoke.mesh);
  }

  /** Live fragment count. */
  get liveFragments(): number {
    return this.frags.live;
  }

  /** Live smoke puff count. */
  get liveSmoke(): number {
    return this.smoke.live;
  }

  /** Sheds `count` fragments of shell `colour` (0xRRGGBB) around a snail at `at`. */
  spawnFragments(at: THREE.Vector3, colour: number, count: number): void {
    if (!tierSpawnsFragments(this.tier)) return;
    const r = this.random;
    for (let i = 0; i < count; i++) {
      emitChunk(this.frags.pool, {
        x: at.x + (r() - 0.5) * 0.4,
        y: at.y + 0.3 + r() * 0.3,
        z: at.z + (r() - 0.5) * 0.4,
        vx: (r() - 0.5) * 3,
        vy: 1.5 + r() * 2.5,
        vz: (r() - 0.5) * 3,
        rx: r() * 6,
        ry: r() * 6,
        rz: r() * 6,
        sx: (r() - 0.5) * 12,
        sy: (r() - 0.5) * 12,
        sz: (r() - 0.5) * 12,
        size: 0.04 + r() * 0.05,
        colour,
        life: FRAGMENT_LIFE,
        floorY: at.y,
      });
    }
  }

  /** Emits a quick puff of pale smoke where a snail's body slid out of its shell. */
  spawnPuff(at: THREE.Vector3): void {
    const r = this.random;
    for (let i = 0; i < 4; i++) {
      emitChunk(this.smoke.pool, {
        x: at.x + (r() - 0.5) * 0.3,
        y: at.y + 0.3 + r() * 0.2,
        z: at.z + (r() - 0.5) * 0.3,
        vx: (r() - 0.5) * 0.8,
        vy: 0.6,
        vz: (r() - 0.5) * 0.8,
        rx: 0,
        ry: 0,
        rz: 0,
        sx: 0,
        sy: 0,
        sz: 0,
        size: 0.3,
        colour: 0xe8e4dc,
        life: 0.9,
        floorY: 0,
      });
    }
  }

  /** Emits intermittent smoke wisps for a critical snail; call each frame while it is critical. */
  tickSmoke(id: string, at: THREE.Vector3, dt: number): void {
    const left = (this.timers.get(id) ?? this.random() * SMOKE_INTERVAL) - dt;
    if (left > 0) {
      this.timers.set(id, left);
      return;
    }
    this.timers.set(id, SMOKE_INTERVAL * (0.6 + this.random() * 0.8));
    const r = this.random;
    emitChunk(this.smoke.pool, {
      x: at.x + (r() - 0.5) * 0.2,
      y: at.y + 0.7,
      z: at.z + (r() - 0.5) * 0.2,
      vx: (r() - 0.5) * 0.2,
      vy: 0.5,
      vz: (r() - 0.5) * 0.2,
      rx: 0,
      ry: 0,
      rz: 0,
      sx: 0,
      sy: 0,
      sz: 0,
      size: 0.18,
      colour: 0x555555,
      life: 2,
      floorY: 0,
    });
  }

  /** Forgets a snail's smoke timer. */
  forget(id: string): void {
    this.timers.delete(id);
  }

  /** Advances both pools. */
  advance(dt: number): void {
    this.frags.advance(dt);
    this.smoke.advance(dt);
  }

  /** Frees GPU resources. */
  dispose(): void {
    this.frags.dispose();
    this.smoke.dispose();
    this.geo.dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
