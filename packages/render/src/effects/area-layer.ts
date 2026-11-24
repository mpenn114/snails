import * as THREE from 'three';
import type { AreaInstance } from '@snails/core';
import type { FrameUpdater } from '../render-loop.js';
import { PALETTE } from '../style/palette.js';

/** Placeholder look for lingering areas: a soft translucent low-poly dome per area. */
const AREA_OPACITY = 0.28;
/** Seconds-scale bob so a dome reads as alive without any per-kind art. */
const PULSE_RATE = 1.6;

/**
 * Draws every `GameState.areas` entry as a translucent icosphere (one shared geometry and
 * material, `mobile`-cheap). A later job gives each area kind its own visuals; this only makes
 * areas visible. Pure view: reads positions and radii from the snapshot.
 */
export class AreaLayer {
  /** Attach this to `roots.effects`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: syncs from the render state each frame. */
  readonly updater: FrameUpdater;
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly geo = new THREE.IcosahedronGeometry(1, 1);
  private readonly mat = new THREE.MeshBasicMaterial({
    color: PALETTE.waterFoam,
    transparent: true,
    opacity: AREA_OPACITY,
    depthWrite: false,
  });
  private clock = 0;

  /** Creates an empty layer. */
  constructor() {
    this.group.name = 'areas';
    this.updater = (dt, state) => {
      this.clock += dt;
      if (state) this.sync(state.snapshot.areas ?? []);
    };
  }

  /** Number of live area meshes. */
  get size(): number {
    return this.meshes.size;
  }

  /** Creates, moves and removes meshes to match `areas` by id. */
  sync(areas: readonly AreaInstance[]): void {
    const seen = new Set<string>();
    for (const a of areas) {
      seen.add(a.id);
      let mesh = this.meshes.get(a.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.geo, this.mat);
        this.meshes.set(a.id, mesh);
        this.group.add(mesh);
      }
      const pulse = 1 + 0.03 * Math.sin(this.clock * PULSE_RATE);
      mesh.position.set(a.position.x, a.position.y, a.position.z);
      mesh.scale.setScalar(Math.max(0.1, a.radius) * pulse);
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      mesh.removeFromParent();
      this.meshes.delete(id);
    }
  }

  /** Removes all meshes and frees the shared geometry and material. */
  dispose(): void {
    this.meshes.clear();
    this.geo.dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
