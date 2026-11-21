import * as THREE from 'three';
import type { FrameUpdater, RenderState } from './render-loop.js';
import { SnailAssets, canvasLabelFactory, type LabelTextureFactory } from './snail-assets.js';
import { SnailMesh } from './snail-mesh.js';
import { snailViewsFromSnapshot, type SnailView } from './snail-view.js';

/** Options for SnailLayer. */
export interface SnailLayerOptions {
  /** Name-tag texture factory (inject a fake in Node tests). */
  labelFactory?: LabelTextureFactory;
  /** Camera that health bars face; bars face +Z when absent. */
  camera?: THREE.Camera;
  /** Maps render state to snail views (default: raw snapshot, no interpolation). */
  selectViews?: (state: RenderState) => SnailView[];
}

/** Owns all snail meshes; keeps them in sync with a list of snail views by id. */
export class SnailLayer {
  /** Attach this to `roots.entities`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: syncs from the render state each frame. */
  readonly updater: FrameUpdater;
  private readonly meshes = new Map<string, SnailMesh>();
  private readonly assets = new SnailAssets();
  private readonly labelFactory: LabelTextureFactory;
  private camera: THREE.Camera | null;

  /** Creates an empty layer. */
  constructor(opts: SnailLayerOptions = {}) {
    this.labelFactory = opts.labelFactory ?? canvasLabelFactory;
    this.camera = opts.camera ?? null;
    this.group.name = 'snails';
    const select = opts.selectViews ?? ((s: RenderState) => snailViewsFromSnapshot(s.snapshot));
    this.updater = (_dt, state) => {
      if (state) this.sync(select(state));
    };
  }

  /** Sets the camera that health bars billboard towards. */
  setCamera(camera: THREE.Camera | null): void {
    this.camera = camera;
  }

  /** Number of live meshes. */
  get size(): number {
    return this.meshes.size;
  }

  /** Mesh for a snail id, if present. */
  get(id: string): SnailMesh | undefined {
    return this.meshes.get(id);
  }

  /** Creates, updates and removes meshes so they match `views`. */
  sync(views: readonly SnailView[]): void {
    const seen = new Set<string>();
    for (const v of views) {
      seen.add(v.id);
      let mesh = this.meshes.get(v.id);
      if (!mesh) {
        mesh = new SnailMesh(v.colour, this.assets, this.labelFactory);
        this.meshes.set(v.id, mesh);
        this.group.add(mesh.group);
      }
      mesh.apply(v);
      if (this.camera) mesh.barGroup.quaternion.copy(this.camera.quaternion);
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      mesh.dispose();
      this.meshes.delete(id);
    }
  }

  /** Removes all meshes and frees every geometry, material and texture. */
  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.meshes.clear();
    this.assets.dispose();
    this.group.removeFromParent();
  }
}
