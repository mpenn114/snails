import * as THREE from 'three';
import type { FrameUpdater, RenderState } from './render-loop.js';
import {
  BAR_WIDTH,
  SnailAssets,
  canvasLabelFactory,
  type LabelTextureFactory,
} from './snail-assets.js';
import { declutterLabels, type LabelBox } from './label-declutter.js';
import { hashShellSeed } from './snail/shell-geometry.js';
import type { QualityTier } from './quality.js';
import { SnailMesh } from './snail-mesh.js';
import { snailViewsFromSnapshot, type SnailView } from './snail-view.js';

/** Camera distance (m) at which labels have their base size. */
export const LABEL_REF_DISTANCE = 24;
/** Largest label scale factor (caps size for very distant snails). */
export const LABEL_MAX_SCALE = 3;
/** Smallest label scale factor (keeps close-up labels from vanishing). */
export const LABEL_MIN_SCALE = 0.25;

/** Label scale giving a roughly constant on-screen size: proportional to distance (clamped). */
export function labelScaleForDistance(distance: number): number {
  return Math.min(LABEL_MAX_SCALE, Math.max(LABEL_MIN_SCALE, distance / LABEL_REF_DISTANCE));
}

/** Options for SnailLayer. */
export interface SnailLayerOptions {
  /** Name-tag texture factory (inject a fake in Node tests). */
  labelFactory?: LabelTextureFactory;
  /** Camera that health bars face; bars face +Z when absent. */
  camera?: THREE.Camera;
  /** Maps render state to snail views (default: raw snapshot, no interpolation). */
  selectViews?: (state: RenderState) => SnailView[];
  /** Quality tier: picks the snail level of detail and toon variant (default high). */
  tier?: QualityTier;
  /** Snail bodies cast shadows (default false). */
  shadows?: boolean;
}

/** Owns all snail meshes; keeps them in sync with a list of snail views by id. */
export class SnailLayer {
  /** Attach this to `roots.entities`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: syncs from the render state each frame. */
  readonly updater: FrameUpdater;
  private readonly meshes = new Map<string, SnailMesh>();
  private readonly assets: SnailAssets;
  private readonly labelFactory: LabelTextureFactory;
  private camera: THREE.Camera | null;

  /** Creates an empty layer. */
  private shadows: boolean;

  constructor(opts: SnailLayerOptions = {}) {
    this.assets = new SnailAssets(opts.tier ? { tier: opts.tier } : {});
    this.labelFactory = opts.labelFactory ?? canvasLabelFactory;
    this.camera = opts.camera ?? null;
    this.shadows = opts.shadows ?? false;
    this.group.name = 'snails';
    const select = opts.selectViews ?? ((s: RenderState) => snailViewsFromSnapshot(s.snapshot));
    this.updater = (_dt, state) => {
      if (state) this.sync(select(state));
    };
  }

  /** Enables or disables shadow casting on all existing and future snail meshes. */
  setShadows(on: boolean): void {
    this.shadows = on;
    for (const mesh of this.meshes.values()) mesh.setCastShadow(on);
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
        mesh = new SnailMesh(
          v.colour,
          this.assets,
          this.labelFactory,
          hashShellSeed(v.teamId, v.id),
          v.teamIndex,
        );
        mesh.setCastShadow(this.shadows);
        this.meshes.set(v.id, mesh);
        this.group.add(mesh.group);
      }
      mesh.apply(v);
      this.faceCamera(mesh);
      mesh.billboard = () => this.faceCamera(mesh);
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      mesh.dispose();
      this.meshes.delete(id);
    }
    this.declutter();
  }

  /** Orients the bar towards the camera and sizes labels for its current distance. */
  private faceCamera(mesh: SnailMesh): void {
    const cam = this.camera;
    if (!cam) return;
    mesh.barGroup.quaternion.copy(cam.quaternion);
    mesh.setLabelScale(labelScaleForDistance(cam.position.distanceTo(mesh.group.position)));
  }

  /**
   * Keeps each snail's label stack (health bar plus name tag) clear of its neighbours: nearer
   * snails win, the others are lifted by whole stack heights, and a name tag with no free slot is
   * hidden. The bar itself is never hidden. Lifts live on the mesh so the per-frame re-billboard
   * keeps them.
   */
  private declutter(): void {
    const cam = this.camera;
    if (!(cam instanceof THREE.PerspectiveCamera)) return;
    cam.updateMatrixWorld();
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const boxes: LabelBox[] = [];
    const tmp = new THREE.Vector3();
    for (const [id, mesh] of this.meshes) {
      mesh.setLabelLift(0);
      if (!mesh.barGroup.visible) continue;
      const f = mesh.labelScale;
      const tag = mesh.nameTag.visible;
      tmp.copy(mesh.group.position).y += mesh.barGroup.position.y;
      const d = cam.position.distanceTo(tmp);
      const ndc = tmp.project(cam);
      const unit = 1 / (d * tanHalf); // world metres -> NDC height
      const wide = (tag ? 2.4 : BAR_WIDTH + 0.06) * f;
      const high = (tag ? 0.8 : 0.26) * f;
      boxes.push({
        id,
        x: ndc.x,
        y: ndc.y,
        width: (wide * unit) / cam.aspect,
        height: high * unit,
        distance: d,
      });
    }
    for (const p of declutterLabels(boxes)) {
      const mesh = this.meshes.get(p.id)!;
      const box = boxes.find((b) => b.id === p.id)!;
      const steps = p.hidden ? 3 : Math.round(p.offsetY / box.height);
      if (p.hidden) mesh.nameTag.visible = false;
      mesh.setLabelLift(steps * box.height * box.distance * tanHalf);
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
