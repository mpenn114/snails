import * as THREE from 'three';
import type { SdfGrid, SimEvent } from '@snails/core';
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
import type { ResearchVisuals } from './research/research-visuals.js';
import { SnailMesh } from './snail-mesh.js';
import { reactionsForEvent, scareStrength } from './snail/snail-expression.js';
import { FlowerAssets, createFlower } from './snail/death-flower.js';
import { ShellDebris, crossingFragmentCount, hitFragmentCount } from './snail/shell-debris.js';
import { crackStateFor } from './snail/crack-damage.js';
import { groundNormalAt } from './snail/terrain-tilt.js';
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
  /** Research feedback source: shell looks and shimmer flags per team. */
  research?: ResearchVisuals;
}

/** Owns all snail meshes; keeps them in sync with a list of snail views by id. */
export class SnailLayer {
  /** Attach this to `roots.entities`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: syncs from the render state each frame. */
  readonly updater: FrameUpdater;
  /** Shell fragments and critical smoke; attach next to `group` (kept separate from snail meshes). */
  readonly debrisGroup: THREE.Group;
  private readonly meshes = new Map<string, SnailMesh>();
  private readonly assets: SnailAssets;
  private readonly labelFactory: LabelTextureFactory;
  private camera: THREE.Camera | null;
  private readonly debris: ShellDebris;
  private readonly flowers = new Map<string, THREE.Group>();
  private readonly flowerAssets = new FlowerAssets();
  private readonly lastDied = new Map<string, { x: number; y: number; z: number }>();
  private waterLevel: number | null = null;
  private terrain: SdfGrid | null = null;
  private readonly ratios = new Map<string, number>();
  private readonly maxHealths = new Map<string, number>();

  /** Creates an empty layer. */
  private shadows: boolean;

  constructor(opts: SnailLayerOptions = {}) {
    this.assets = new SnailAssets(opts.tier ? { tier: opts.tier } : {});
    this.labelFactory = opts.labelFactory ?? canvasLabelFactory;
    this.camera = opts.camera ?? null;
    this.shadows = opts.shadows ?? false;
    this.group.name = 'snails';
    this.debris = new ShellDebris(opts.tier ?? 'high');
    this.debrisGroup = this.debris.group;
    const select = opts.selectViews ?? ((s: RenderState) => snailViewsFromSnapshot(s.snapshot));
    const research = opts.research;
    this.updater = (dt, state) => {
      if (!state) return;
      const views = select(state);
      if (research) for (const v of views) v.research = research.get(v.teamId);
      this.sync(views, dt);
    };
  }

  /** Enables or disables shadow casting on all existing and future snail meshes. */
  setShadows(on: boolean): void {
    this.shadows = on;
    for (const mesh of this.meshes.values()) mesh.setCastShadow(on);
  }

  /** Sets the (live, carvable) terrain grid that snails tilt to; null = always upright. */
  setTerrain(grid: SdfGrid | null): void {
    this.terrain = grid;
  }

  /** Sets the water surface height (drowned shells float there); null = unknown. */
  setWaterLevel(y: number | null): void {
    this.waterLevel = y;
    for (const mesh of this.meshes.values()) mesh.waterLevel = y;
  }

  /** Shows a flower at the last shell of each eliminated team, and removes stale ones. */
  private syncFlowers(views: readonly SnailView[]): void {
    const teams = new Map<string, SnailView[]>();
    for (const v of views) teams.set(v.teamId, [...(teams.get(v.teamId) ?? []), v]);
    for (const [teamId, vs] of teams) {
      const out = vs.every((v) => !v.alive);
      const last = this.lastDied.get(teamId) ?? vs[vs.length - 1]?.position;
      let flower = this.flowers.get(teamId);
      if (!out || !last) {
        if (flower) {
          flower.removeFromParent();
          this.flowers.delete(teamId);
        }
        continue;
      }
      if (!flower) {
        flower = createFlower(this.flowerAssets);
        this.flowers.set(teamId, flower);
        this.group.add(flower);
      }
      flower.position.set(last.x + 0.35, last.y, last.z);
    }
    for (const [teamId, flower] of this.flowers) {
      if (teams.has(teamId)) continue;
      flower.removeFromParent();
      this.flowers.delete(teamId);
    }
  }

  /** Sets the camera that health bars billboard towards. */
  setCamera(camera: THREE.Camera | null): void {
    this.camera = camera;
  }

  /** Number of live meshes. */
  get size(): number {
    return this.meshes.size;
  }

  /** World positions (chest height) of a team's living snails. */
  livingPositions(teamId: string): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const mesh of this.meshes.values()) {
      if (mesh.teamId !== teamId || !mesh.bodyGroup.visible) continue;
      out.push(mesh.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
    }
    return out;
  }

  /** Mesh for a snail id, if present. */
  get(id: string): SnailMesh | undefined {
    return this.meshes.get(id);
  }

  /**
   * Creates, updates and removes meshes so they match `views`; `dt` (seconds, default 0) advances
   * the body animation and expressions.
   */
  sync(views: readonly SnailView[], dt = 0): void {
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
        mesh.waterLevel = this.waterLevel;
        mesh.onDied = (at) => {
          this.debris.spawnPuff(at);
          this.lastDied.set(v.teamId, { x: at.x, y: at.y, z: at.z });
        };
        this.meshes.set(v.id, mesh);
        this.group.add(mesh.group);
      }
      mesh.apply(v);
      const g = this.terrain;
      mesh.groundNormal =
        g && v.alive && v.grounded !== false
          ? groundNormalAt((p) => g.normal(p), v.position)
          : null;
      mesh.animate(dt, v);
      this.updateDebris(v, mesh, dt);
      this.faceCamera(mesh);
      mesh.billboard = () => this.faceCamera(mesh);
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      mesh.dispose();
      this.meshes.delete(id);
      this.ratios.delete(id);
      this.maxHealths.delete(id);
      this.debris.forget(id);
    }
    this.debris.advance(dt);
    this.syncFlowers(views);
    this.declutter();
  }

  /**
   * Feeds sim events to the snails' cosmetic reactions: hit squint and squash, wide eyes when
   * firing, stalks pulled in near explosions, cheering winners, landing squash.
   */
  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'snailLanded') {
        this.meshes.get(e.snailId)?.animator.landed(Math.min(1, e.impactSpeed / 10));
        continue;
      }
      if (e.type === 'snailDrowned') this.meshes.get(e.snailId)?.markDrowned();
      if (e.type === 'snailDamaged') this.shedOnHit(e.snailId, e.amount);
      for (const r of reactionsForEvent(e)) {
        if (r.snailId) this.meshes.get(r.snailId)?.react(r.kind, r.strength);
        for (const mesh of this.meshes.values()) {
          if (r.teamId !== undefined && mesh.teamId === r.teamId) mesh.react(r.kind, r.strength);
          if (!r.near) continue;
          const p = mesh.group.position;
          const d = Math.hypot(p.x - r.near.x, p.y + 0.4 - r.near.y, p.z - r.near.z);
          const k = scareStrength(d, r.near.radius);
          if (k > 0.05) mesh.react(r.kind, k);
        }
      }
    }
  }

  /** Spawns crossing fragments and critical smoke for one snail view. */
  private updateDebris(v: SnailView, mesh: SnailMesh, dt: number): void {
    const ratio = v.maxHealth > 0 ? v.health / v.maxHealth : 1;
    const prev = this.ratios.get(v.id) ?? ratio;
    this.ratios.set(v.id, ratio);
    this.maxHealths.set(v.id, v.maxHealth);
    const n = crossingFragmentCount(prev, ratio);
    if (n > 0) this.debris.spawnFragments(mesh.group.position, v.colour, n);
    if (v.alive && crackStateFor(ratio) === 'critical') {
      this.debris.tickSmoke(v.id, mesh.group.position, dt);
    }
  }

  /** Sheds a few fragments from a hit snail's shell. */
  private shedOnHit(id: string, amount: number): void {
    const mesh = this.meshes.get(id);
    if (!mesh) return;
    const n = hitFragmentCount(amount, this.maxHealths.get(id) ?? 0);
    this.debris.spawnFragments(mesh.group.position, mesh.colour, n);
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
    this.debris.dispose();
    this.flowerAssets.dispose();
    this.assets.dispose();
    this.group.removeFromParent();
  }
}
