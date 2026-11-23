import { createToonMaterial } from '../style/materials.js';
import { PALETTE } from '../style/palette.js';
import * as THREE from 'three';
import type { Projectile } from '@snails/core';
import type { FrameUpdater, RenderState } from '../render-loop.js';

/** Options for {@link ProjectileLayer}. */
export interface ProjectileLayerOptions {
  /** Trail samples kept per projectile (min 2, default 24). */
  trailLength?: number;
  /** Multiplier on the projectile's own radius for the pebble (default 1). */
  radiusScale?: number;
  /** Maps render state to projectiles (default: snapshot projectiles). */
  selectProjectiles?: (state: RenderState) => readonly Projectile[];
  /** Pebbles cast shadows (default false). */
  shadows?: boolean;
}

const FORWARD = new THREE.Vector3(0, 0, 1);
const tmpDir = new THREE.Vector3();

/** One in-flight projectile: pebble mesh plus a fading trail line (oldest first). */
export class ProjectileMesh {
  /** Root group (pebble + trail). */
  readonly group = new THREE.Group();
  /** The pebble mesh. */
  readonly pebble: THREE.Mesh;
  private readonly trailPositions: Float32Array;
  private readonly trailColours: Float32Array;
  private readonly trailGeometry = new THREE.BufferGeometry();
  private readonly positionAttr: THREE.BufferAttribute;
  private filled = 0;

  /** Creates a mesh sharing the given geometry and materials. */
  constructor(
    private readonly length: number,
    pebbleGeo: THREE.BufferGeometry,
    pebbleMat: THREE.Material,
    trailMat: THREE.Material,
  ) {
    this.pebble = new THREE.Mesh(pebbleGeo, pebbleMat);
    this.trailPositions = new Float32Array(length * 3);
    this.trailColours = new Float32Array(length * 3);
    for (let i = 0; i < length; i++) {
      const f = i / (length - 1);
      this.trailColours.fill(f, i * 3, i * 3 + 3);
    }
    this.positionAttr = new THREE.BufferAttribute(this.trailPositions, 3);
    this.trailGeometry.setAttribute('position', this.positionAttr);
    this.trailGeometry.setAttribute('color', new THREE.BufferAttribute(this.trailColours, 3));
    this.trailGeometry.setDrawRange(0, 0);
    const trail = new THREE.Line(this.trailGeometry, trailMat);
    trail.frustumCulled = false;
    this.group.add(this.pebble, trail);
  }

  /** Number of trail samples currently held. */
  get trailCount(): number {
    return this.filled;
  }

  /** Moves the pebble, orients it along velocity and pushes a trail sample. */
  apply(p: Projectile, radiusScale: number): void {
    const r = Math.max(0.05, p.radius) * radiusScale;
    this.pebble.position.set(p.position.x, p.position.y, p.position.z);
    this.pebble.scale.set(r, r, r * 1.4);
    tmpDir.set(p.velocity.x, p.velocity.y, p.velocity.z);
    if (tmpDir.lengthSq() > 1e-8) {
      this.pebble.quaternion.setFromUnitVectors(FORWARD, tmpDir.normalize());
    }
    const a = this.trailPositions;
    if (this.filled === this.length) a.copyWithin(0, 3);
    else this.filled++;
    const k = (this.filled - 1) * 3;
    a[k] = p.position.x;
    a[k + 1] = p.position.y;
    a[k + 2] = p.position.z;
    // Colours ramp 0..1 over the full length; align the visible tail to the newest end.
    this.trailGeometry.setDrawRange(0, this.filled);
    this.positionAttr.needsUpdate = true;
  }

  /** Frees the trail geometry and detaches from the parent. */
  dispose(): void {
    this.trailGeometry.dispose();
    this.group.removeFromParent();
  }
}

/** Owns pebble + trail meshes for in-flight projectiles, synced by id. */
export class ProjectileLayer {
  /** Attach this to `roots.effects`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: syncs from the render state each frame. */
  readonly updater: FrameUpdater;
  private readonly meshes = new Map<string, ProjectileMesh>();
  private readonly pebbleGeo = new THREE.SphereGeometry(1, 10, 8);
  private readonly pebbleMat = createToonMaterial({ color: PALETTE.rock, flat: true });
  private readonly trailMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    color: PALETTE.sunLight,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private readonly trailLength: number;
  private readonly radiusScale: number;
  private readonly shadows: boolean;

  /** Creates an empty layer. */
  constructor(opts: ProjectileLayerOptions = {}) {
    this.trailLength = Math.max(2, Math.floor(opts.trailLength ?? 24));
    this.radiusScale = opts.radiusScale ?? 1;
    this.shadows = opts.shadows ?? false;
    this.group.name = 'projectiles';
    const select =
      opts.selectProjectiles ?? ((s: RenderState): readonly Projectile[] => s.snapshot.projectiles);
    this.updater = (_dt, state) => {
      if (state) this.sync(select(state));
    };
  }

  /** Number of live projectile meshes. */
  get size(): number {
    return this.meshes.size;
  }

  /** Mesh for a projectile id, if present. */
  get(id: string): ProjectileMesh | undefined {
    return this.meshes.get(id);
  }

  /** Creates, updates and removes meshes so they match `projectiles` by id. */
  sync(projectiles: readonly Projectile[]): void {
    const seen = new Set<string>();
    for (const p of projectiles) {
      seen.add(p.id);
      let mesh = this.meshes.get(p.id);
      if (!mesh) {
        mesh = new ProjectileMesh(this.trailLength, this.pebbleGeo, this.pebbleMat, this.trailMat);
        mesh.pebble.castShadow = this.shadows;
        this.meshes.set(p.id, mesh);
        this.group.add(mesh.group);
      }
      mesh.apply(p, this.radiusScale);
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      mesh.dispose();
      this.meshes.delete(id);
    }
  }

  /** Removes all meshes and frees shared geometry/materials. */
  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.meshes.clear();
    this.pebbleGeo.dispose();
    this.pebbleMat.dispose();
    this.trailMat.dispose();
    this.group.removeFromParent();
  }
}
