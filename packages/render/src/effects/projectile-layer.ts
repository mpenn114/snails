import * as THREE from 'three';
import type { Projectile } from '@snails/core';
import type { FrameUpdater, RenderState } from '../render-loop.js';
import { createToonMaterial } from '../style/materials.js';
import { wispAlpha, wispScale } from './blast-params.js';
import type { ChunkPhysics } from './chunk-pool.js';
import { SoftPuffs } from './soft-puffs.js';
import {
  LOOK_SCALE,
  LOOK_SPIN,
  LOOK_TRAIL,
  buildLookGeometry,
  lookFor,
  type ProjectileLook,
} from './projectile-looks.js';
import { createTrailState, emitTrail, type TrailSpec, type TrailState } from './trail-emitter.js';

/** Options for {@link ProjectileLayer}. */
export interface ProjectileLayerOptions {
  /** Trail puffs kept alive per projectile at quality 1 (min 4, default 48). */
  trailLength?: number;
  /** Tier particle multiplier (`particleScale`); thins the trail on weak devices. Default 1. */
  quality?: number;
  /** Multiplier on the projectile's own radius for the pebble (default 1). */
  radiusScale?: number;
  /** Maps render state to projectiles (default: snapshot projectiles). */
  selectProjectiles?: (state: RenderState) => readonly Projectile[];
  /** Pebbles cast shadows (default false). */
  shadows?: boolean;
}

/** Seconds one trail puff lives. */
const PUFF_LIFE = 0.9;
/** Simultaneous projectiles the trail pool is sized for. */
const POOL_PROJECTILES = 3;
const PUFF_PHYSICS: ChunkPhysics = { gravity: -0.25, drag: 1.2, restitution: 0 };

const FORWARD = new THREE.Vector3(0, 0, 1);
const tmpDir = new THREE.Vector3();
const tmpSpin = new THREE.Quaternion();

const LOOKS: readonly ProjectileLook[] = ['pebble', 'roller', 'drill', 'missile'];

/** One in-flight projectile: a spinning pebble, stone or drill bit plus its trail emission state. */
export class ProjectileMesh {
  /** Root group. */
  readonly group = new THREE.Group();
  /** The pebble mesh. */
  readonly pebble: THREE.Mesh;
  /** Where the trail last emitted from. */
  readonly trail: TrailState = createTrailState();

  /** Creates a mesh sharing the given geometry and material. */
  constructor(
    pebbleGeo: THREE.BufferGeometry,
    pebbleMat: THREE.Material,
    readonly look: ProjectileLook = 'pebble',
  ) {
    this.pebble = new THREE.Mesh(pebbleGeo, pebbleMat);
    this.group.add(this.pebble);
  }

  /** Moves the pebble, aims it along its velocity and spins it about that axis by age. */
  apply(p: Projectile, radiusScale: number): void {
    const r = Math.max(0.05, p.radius) * radiusScale * LOOK_SCALE[this.look];
    this.pebble.position.set(p.position.x, p.position.y, p.position.z);
    this.pebble.scale.set(r, r, r);
    tmpDir.set(p.velocity.x, p.velocity.y, p.velocity.z);
    if (tmpDir.lengthSq() > 1e-8) {
      this.pebble.quaternion.setFromUnitVectors(FORWARD, tmpDir.normalize());
    }
    tmpSpin.setFromAxisAngle(FORWARD, p.age * LOOK_SPIN[this.look]);
    this.pebble.quaternion.multiply(tmpSpin);
  }

  /** Detaches from the parent. */
  dispose(): void {
    this.group.removeFromParent();
  }
}

/** Owns pebble meshes and a shared instanced puff trail for in-flight projectiles. */
export class ProjectileLayer {
  /** Attach this to `roots.effects`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: syncs from the render state and ages the trail each frame. */
  readonly updater: FrameUpdater;
  private readonly meshes = new Map<string, ProjectileMesh>();
  private readonly geos = new Map<ProjectileLook, THREE.BufferGeometry>(
    LOOKS.map((l) => [l, buildLookGeometry(l)]),
  );
  private readonly pebbleMat = createToonMaterial({
    color: 0xffffff,
    flat: true,
    vertexColors: true,
  });
  private readonly puffs: SoftPuffs;
  private readonly radiusScale: number;
  private readonly shadows: boolean;
  private readonly spacing: number;

  /** Creates an empty layer. */
  constructor(opts: ProjectileLayerOptions = {}) {
    const q = Math.min(1, Math.max(0.1, opts.quality ?? 1));
    const perProjectile = Math.max(4, Math.floor((opts.trailLength ?? 64) * q));
    this.spacing = 0.12 / Math.sqrt(q);
    this.radiusScale = opts.radiusScale ?? 1;
    this.shadows = opts.shadows ?? false;
    this.group.name = 'projectiles';
    this.puffs = new SoftPuffs(perProjectile * POOL_PROJECTILES, PUFF_PHYSICS, {
      scale: wispScale,
      alpha: wispAlpha,
    });
    this.group.add(this.puffs.mesh);
    const select =
      opts.selectProjectiles ?? ((s: RenderState): readonly Projectile[] => s.snapshot.projectiles);
    this.updater = (dt, state) => {
      if (state) this.sync(select(state), dt);
      else this.puffs.advance(dt);
    };
  }

  /** Number of live projectile meshes. */
  get size(): number {
    return this.meshes.size;
  }

  /** Number of live trail puffs. */
  get livePuffs(): number {
    return this.puffs.live;
  }

  /** Mesh for a projectile id, if present. */
  get(id: string): ProjectileMesh | undefined {
    return this.meshes.get(id);
  }

  /** Creates, updates and removes meshes to match `projectiles` by id, and ages the trail by `dt`. */
  sync(projectiles: readonly Projectile[], dt = 0): void {
    const seen = new Set<string>();
    for (const p of projectiles) {
      seen.add(p.id);
      let mesh = this.meshes.get(p.id);
      if (!mesh) {
        const look = lookFor(p.weaponId);
        mesh = new ProjectileMesh(
          this.geos.get(look) as THREE.BufferGeometry,
          this.pebbleMat,
          look,
        );
        mesh.pebble.castShadow = this.shadows;
        this.meshes.set(p.id, mesh);
        this.group.add(mesh.group);
      }
      mesh.apply(p, this.radiusScale);
      const spec: TrailSpec = {
        spacing: this.spacing,
        size: Math.max(0.05, p.radius) * this.radiusScale * LOOK_SCALE[mesh.look] * 0.5,
        life: PUFF_LIFE,
        colour: LOOK_TRAIL[mesh.look],
      };
      emitTrail(this.puffs.pool, mesh.trail, p.position.x, p.position.y, p.position.z, spec);
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      mesh.dispose();
      this.meshes.delete(id);
    }
    this.puffs.advance(dt);
  }

  /** Removes all meshes and frees shared geometry/materials. */
  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.meshes.clear();
    this.puffs.dispose();
    for (const geo of this.geos.values()) geo.dispose();
    this.pebbleMat.dispose();
    this.group.removeFromParent();
  }
}
