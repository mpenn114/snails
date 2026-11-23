import * as THREE from 'three';
import { SdfGrid } from '@snails/core';
import type { GameSnapshot, SimEvent } from '@snails/core';
import { CameraRig, type CameraMode } from './camera/camera-rig.js';
import { ExplosionEffects } from './effects/explosion-effects.js';
import { createWindParticles, type WindParticles } from './environment/wind-particles.js';
import { ProjectileLayer } from './effects/projectile-layer.js';
import { SnapshotBuffer } from './interpolation.js';
import type { QualityTier } from './quality.js';
import type { FrameUpdater, RenderState } from './render-loop.js';
import type { LabelTextureFactory } from './snail-assets.js';
import { SnailLayer } from './snail-layer.js';
import { snailViewsFromSnapshot } from './snail-view.js';
import { createWorkerPool, type MeshTransport } from './terrain/mesh-transport.js';
import { createTerrainMaterialForTier } from './terrain/terrain-material.js';
import { TerrainMeshManager } from './terrain/terrain-mesh-manager.js';
import { TerrainReplica } from './terrain/terrain-replica.js';
import type { GameView } from './view.js';

/** Data needed to start rendering a match. */
export interface MatchInit {
  /**
   * Terrain voxel grid at match start. The renderer keeps its own copy (the caller's grid is
   * never mutated). Producing it (e.g. generating from a seed) is the caller's job: core's
   * generator is forbidden to render by the boundary rule.
   */
  grid: SdfGrid;
  /** Water surface height in metres. */
  waterLevel: number;
}

/** Terrain world bounds and water level handed to the view factory. */
export interface ViewEnvironment {
  bounds: { min: THREE.Vector3; max: THREE.Vector3 };
  waterLevel: number;
}

/** Everything {@link MatchRenderer} needs injected. */
export interface MatchRendererDeps {
  /** Builds the view once the terrain bounds and water level are known. */
  makeView: (env: ViewEnvironment) => GameView;
  /** Mesh transport factory; default is a 2-worker pool (browser only). */
  makeTransport?: () => MeshTransport;
  /** Clock in ms for snapshot interpolation. */
  now: () => number;
  /** Random source for effects (tests inject a seeded one). */
  random?: () => number;
  /** Name-tag texture factory for snail labels (inject in Node). */
  labelFactory?: LabelTextureFactory;
}

/** An extra per-frame layer plugged in via {@link MatchRenderer.addLayer}. */
export interface ExtraLayer {
  /** Debug name. */
  name: string;
  /** Object added to the effects root. */
  group?: THREE.Object3D;
  /** Per-frame updater. */
  updater?: FrameUpdater;
}

/** Wind mote count at particleScale 1. */
const WIND_PARTICLE_BASE_COUNT = 600;

function cloneGrid(g: SdfGrid): SdfGrid {
  const c = new SdfGrid(g.nx, g.ny, g.nz, g.cellSize, 1, g.chunkSize);
  c.data.set(g.data);
  c.takeDirtyChunks();
  return c;
}

function groundHeight(grid: SdfGrid, x: number, z: number): number {
  const top = grid.worldSize().y;
  for (let y = top; y > 0; y -= grid.cellSize) {
    if (grid.isSolid({ x, y, z })) return y;
  }
  return 0;
}

/** Layers and managers that exist only between `init` and teardown. */
interface Built {
  view: GameView;
  terrain: TerrainMeshManager;
  replica: TerrainReplica;
  snails: SnailLayer;
  projectiles: ProjectileLayer;
  explosions: ExplosionEffects;
  rig: CameraRig;
  wind: WindParticles;
  material: THREE.Material;
  removers: (() => void)[];
}

/**
 * Facade composing view, terrain, snails, projectiles, explosions and camera into one object
 * driven purely by data: `init`, `pushSnapshot` and `handleEvents`.
 */
export class MatchRenderer {
  private built: Built | null = null;
  private size: { w: number; h: number } | null = null;
  private tier: QualityTier | null = null;
  private readonly buffer: SnapshotBuffer;
  private readonly extras: ExtraLayer[] = [];

  /** Creates an idle renderer; nothing is built until `init`. */
  constructor(private readonly deps: MatchRendererDeps) {
    this.buffer = new SnapshotBuffer({ now: deps.now });
  }

  /** The game view (null before `init`). */
  get view(): GameView | null {
    return this.built?.view ?? null;
  }
  /** Snail layer (null before `init`). */
  get snailLayer(): SnailLayer | null {
    return this.built?.snails ?? null;
  }
  /** Projectile layer (null before `init`). */
  get projectileLayer(): ProjectileLayer | null {
    return this.built?.projectiles ?? null;
  }
  /** Explosion effects (null before `init`). */
  get explosionEffects(): ExplosionEffects | null {
    return this.built?.explosions ?? null;
  }
  /** Terrain mesh manager (null before `init`). */
  get terrainMeshes(): TerrainMeshManager | null {
    return this.built?.terrain ?? null;
  }
  /** Terrain replica (null before `init`). */
  get terrainReplica(): TerrainReplica | null {
    return this.built?.replica ?? null;
  }
  /** Camera rig, follow mode by default (null before `init`). */
  get cameraRig(): CameraRig | null {
    return this.built?.rig ?? null;
  }

  /** Builds the view and all layers for a new match; disposes any previous one. */
  init(init: MatchInit): void {
    this.teardown();
    const ws = init.grid.worldSize();
    const bounds = { min: new THREE.Vector3(0, 0, 0), max: new THREE.Vector3(ws.x, ws.y, ws.z) };
    const view = this.deps.makeView({ bounds, waterLevel: init.waterLevel });
    if (this.tier) view.setTier(this.tier);
    if (this.size) view.resize(this.size.w, this.size.h);
    this.built = this.build(view, init.grid);
    view.setSource(this.buffer);
  }

  private build(view: GameView, source: SdfGrid): Built {
    const q = view.quality;
    const grid = cloneGrid(source);
    const transport = this.deps.makeTransport?.() ?? createWorkerPool(2);
    const material = createTerrainMaterialForTier(view.tier);
    const terrain = new TerrainMeshManager({
      grid,
      transport,
      material,
      budgetMs: q.chunkBudgetMs,
      shadows: q.shadows,
    });
    const replica = new TerrainReplica({ grid });
    terrain.markAllDirty();
    view.roots.terrain.add(terrain.group);

    const snails = new SnailLayer({
      camera: view.camera,
      shadows: q.shadows,
      selectViews: (s: RenderState) => snailViewsFromSnapshot(s.snapshot),
      ...(this.deps.labelFactory ? { labelFactory: this.deps.labelFactory } : {}),
    });
    const projectiles = new ProjectileLayer({ shadows: q.shadows });
    const explosions = new ExplosionEffects({
      quality: q.particleScale,
      maxLights: q.maxDynamicLights,
      ...(this.deps.random ? { random: this.deps.random } : {}),
    });
    view.roots.entities.add(snails.group);
    view.roots.effects.add(projectiles.group, explosions.group);

    const ws = grid.worldSize();
    const rig = new CameraRig(view.camera, {
      mode: 'follow',
      bounds: { min: { x: -20, y: 0, z: -20 }, max: { x: ws.x + 20, y: ws.y + 40, z: ws.z + 20 } },
      heightAt: (x, z) => groundHeight(grid, x, z),
    });
    const wind = createWindParticles({
      bounds: { min: new THREE.Vector3(0, 0, 0), max: new THREE.Vector3(ws.x, ws.y, ws.z) },
      count: Math.round(WIND_PARTICLE_BASE_COUNT * q.particleScale),
      ...(this.deps.random ? { random: this.deps.random } : {}),
    });
    view.roots.effects.add(wind.object);
    const built: Built = {
      view,
      terrain,
      replica,
      snails,
      projectiles,
      explosions,
      rig,
      wind,
      material,
      removers: [],
    };
    this.registerUpdaters(built);
    return built;
  }

  private registerUpdaters(b: Built): void {
    const add = (fn: FrameUpdater): void => {
      b.removers.push(b.view.addUpdater(fn));
    };
    add((dt, s) => b.rig.update(dt, s));
    add(() => {
      const t = b.rig.pose().target;
      b.terrain.setFocus(new THREE.Vector3(t.x, t.y, t.z));
      b.terrain.update();
    });
    add(b.snails.updater);
    add(b.projectiles.updater);
    add(b.explosions.updater);
    add(b.wind.updater);
    for (const e of this.extras) this.attachExtra(b, e);
  }

  private attachExtra(b: Built, e: ExtraLayer): void {
    if (e.updater) b.removers.push(b.view.addUpdater(e.updater));
    if (e.group) b.view.roots.effects.add(e.group);
  }

  /** Feeds a server snapshot into the interpolation buffer; false if it was dropped. */
  pushSnapshot(snapshot: GameSnapshot): boolean {
    return this.buffer.push(snapshot);
  }

  /** Fans events out to the terrain replica and explosion effects. */
  handleEvents(events: readonly SimEvent[]): void {
    this.built?.replica.applyEvents(events);
    this.built?.explosions.handleEvents(events);
  }

  /**
   * Hook for extra layers such as wind particles: `group` joins the effects root and `updater`
   * runs every frame. Works before or after `init` (re-attached on re-init). Returns a remover.
   */
  addLayer(layer: ExtraLayer): () => void {
    this.extras.push(layer);
    if (this.built) this.attachExtra(this.built, layer);
    return () => {
      const i = this.extras.indexOf(layer);
      if (i >= 0) this.extras.splice(i, 1);
      layer.group?.removeFromParent();
    };
  }

  /** Switches camera mode (follow by default). */
  setCameraMode(mode: CameraMode): void {
    this.built?.rig.setMode(mode);
  }

  /** Sets the quality tier; applied immediately if initialised, else on `init`. */
  setTier(tier: QualityTier): void {
    this.tier = tier;
    const b = this.built;
    if (!b) return;
    b.view.setTier(tier);
    b.terrain.setShadows(b.view.quality.shadows);
    b.snails.setShadows(b.view.quality.shadows);
  }

  /** Resizes the view; remembered until `init`. */
  resize(width: number, height: number): void {
    this.size = { w: width, h: height };
    this.built?.view.resize(width, height);
  }

  private teardown(): void {
    const b = this.built;
    this.built = null;
    this.buffer.reset();
    if (!b) return;
    for (const r of b.removers) r();
    b.terrain.dispose();
    b.snails.dispose();
    b.projectiles.dispose();
    b.explosions.dispose();
    b.wind.dispose();
    b.material.dispose();
    b.view.dispose();
  }

  /** Disposes everything. */
  dispose(): void {
    this.teardown();
  }
}
