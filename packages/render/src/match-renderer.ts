import * as THREE from 'three';
import { SdfGrid } from '@snails/core';
import type { GameSnapshot, SimEvent } from '@snails/core';
import { CameraRig, type CameraMode, type CameraRigOptions } from './camera/camera-rig.js';
import { ExplosionEffects } from './effects/explosion-effects.js';
import { TechUnlockBurst } from './effects/tech-unlock-burst.js';
import { ResearchVisuals, type TeamResearchInput } from './research/research-visuals.js';
import type { TechVisualLookup } from './research/shell-look.js';
import { SplashEffects } from './effects/splash-effects.js';
import { createWindParticles, type WindParticles } from './environment/wind-particles.js';
import { ScheduledLayer } from './effects/scheduled-layer.js';
import { AreaLayer } from './effects/area-layer.js';
import { HillLayer } from './effects/hill-layer.js';
import { StrandEffects } from './effects/strand-effects.js';
import { CrateLayer } from './effects/crate-layer.js';
import { ProjectileLayer } from './effects/projectile-layer.js';
import { SnapshotBuffer } from './interpolation.js';
import { createGltfModelLoader, type ModelLoader } from './props/model-loader.js';
import { PropLayer } from './props/prop-layer.js';
import type { QualityTier } from './quality.js';
import type { FrameUpdater, RenderState } from './render-loop.js';
import type { LabelTextureFactory } from './snail-assets.js';
import { SnailLayer } from './snail-layer.js';
import { snailViewsFromSnapshot } from './snail-view.js';
import { createWorkerPool, type MeshTransport } from './terrain/mesh-transport.js';
import { createTerrainMaterialForTier, type TerrainMaterial } from './terrain/terrain-material.js';
import type { TerrainTextureSources } from './terrain/terrain-textures.js';
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
  /**
   * URL prefix (ending in `/`) the scenery models are served from, e.g. `./models/`. Without it
   * no props are drawn (tests, headless use).
   */
  modelBaseUrl?: string;
  /** Model loader override (tests inject a fake; default fetches glTF with GLTFLoader). */
  modelLoader?: ModelLoader;
  /** Terrain texture URLs (loaded async; the palette colours show until they arrive). */
  terrainTextures?: TerrainTextureSources;
  /** Camera rig overrides (the phone uses a three-quarter follow yaw offset). */
  rigOptions?: Partial<CameraRigOptions>;
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
  areas: AreaLayer;
  hill: HillLayer;
  strands: StrandEffects;
  scheduled: ScheduledLayer;
  crates: CrateLayer;
  props: PropLayer | null;
  explosions: ExplosionEffects;
  splashes: SplashEffects;
  unlock: TechUnlockBurst;
  rig: CameraRig;
  wind: WindParticles;
  material: TerrainMaterial;
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
  private ownedLoader: ModelLoader | null = null;
  private readonly research = new ResearchVisuals();

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
  /** Scenery props (null before `init`, or when no `modelBaseUrl` was given). */
  get propLayer(): PropLayer | null {
    return this.built?.props ?? null;
  }
  /** Terrain mesh manager (null before `init`). */
  get terrainMeshes(): TerrainMeshManager | null {
    return this.built?.terrain ?? null;
  }
  /** Terrain replica (null before `init`). */
  get terrainReplica(): TerrainReplica | null {
    return this.built?.replica ?? null;
  }
  /** Resolves true once terrain textures loaded (false if none or failed); null before `init`. */
  get terrainTexturesReady(): Promise<boolean> | null {
    return this.built?.material.texturesReady ?? null;
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
    this.built = this.build(view, init.grid, init.waterLevel);
    view.setSource(this.buffer);
  }

  private build(view: GameView, source: SdfGrid, waterLevel: number): Built {
    const q = view.quality;
    const grid = cloneGrid(source);
    const transport = this.deps.makeTransport?.() ?? createWorkerPool(2);
    const material = createTerrainMaterialForTier(view.tier, {
      originalGrid: source,
      ...(this.deps.terrainTextures ? { textures: this.deps.terrainTextures } : {}),
    });
    const terrain = new TerrainMeshManager({
      grid,
      transport,
      material,
      budgetMs: q.chunkBudgetMs,
      lodDistance: q.terrainLodDistance,
      shadows: q.shadows,
    });
    terrain.markAllDirty();
    view.roots.terrain.add(terrain.group);
    const snails = this.makeSnails(view);
    const projectiles = new ProjectileLayer({ shadows: q.shadows, quality: q.particleScale });
    const areas = new AreaLayer();
    const strands = this.makeStrands(q.particleScale);
    const [scheduled, crates] = [new ScheduledLayer(), new CrateLayer()];
    const hill = new HillLayer();
    const explosions = this.makeExplosions(q.particleScale, q.maxDynamicLights);
    const props = this.makeProps(grid, waterLevel, q.propCount, q.shadows);
    view.roots.entities.add(snails.group, snails.debrisGroup, ...(props ? [props.group] : []));
    const splashes = this.makeSplashes(view, source, waterLevel);
    const wind = this.makeWind(grid, q.particleScale);
    const unlock = this.makeUnlock(view, snails);
    const effects = [projectiles, areas, scheduled, explosions, splashes, strands, crates].map(
      (l) => l.group,
    );
    view.roots.effects.add(...effects, hill.group, wind.object);
    const rig = createRig(view.camera, grid, this.deps.rigOptions);
    const built: Built = {
      view,
      terrain,
      replica: new TerrainReplica({ grid }),
      snails,
      projectiles,
      areas,
      hill,
      strands,
      scheduled,
      crates,
      props,
      explosions,
      splashes,
      unlock,
      rig,
      wind,
      material,
      removers: [],
    };
    this.registerUpdaters(built);
    return built;
  }

  private makeUnlock(view: GameView, snails: SnailLayer): TechUnlockBurst {
    const unlock = new TechUnlockBurst(
      (id) => snails.livingPositions(id),
      view.quality.particleScale,
      this.deps.random,
    );
    view.roots.effects.add(unlock.group);
    return unlock;
  }

  private makeSnails(view: GameView): SnailLayer {
    return new SnailLayer({
      camera: view.camera,
      tier: view.tier,
      shadows: view.quality.shadows,
      research: this.research,
      selectViews: (s: RenderState) => snailViewsFromSnapshot(s.snapshot),
      ...(this.deps.labelFactory ? { labelFactory: this.deps.labelFactory } : {}),
    });
  }

  private makeStrands(quality: number): StrandEffects {
    return new StrandEffects({
      quality,
      ...(this.deps.random ? { random: this.deps.random } : {}),
    });
  }

  private makeExplosions(quality: number, maxLights: number): ExplosionEffects {
    return new ExplosionEffects({
      quality,
      maxLights,
      ...(this.deps.random ? { random: this.deps.random } : {}),
    });
  }

  private makeWind(grid: SdfGrid, particleScale: number): WindParticles {
    const ws = grid.worldSize();
    return createWindParticles({
      bounds: { min: new THREE.Vector3(0, 0, 0), max: new THREE.Vector3(ws.x, ws.y, ws.z) },
      count: Math.round(WIND_PARTICLE_BASE_COUNT * particleScale),
      ...(this.deps.random ? { random: this.deps.random } : {}),
    });
  }

  private makeSplashes(view: GameView, source: SdfGrid, waterLevel: number): SplashEffects {
    view.water?.setTerrain(source);
    return new SplashEffects({
      level: waterLevel,
      quality: view.quality.particleScale,
      ...(this.deps.random ? { random: this.deps.random } : {}),
    });
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
    if (b.props) add(b.props.updater);
    add(b.projectiles.updater);
    add(b.areas.updater);
    add(b.hill.updater);
    add(b.strands.updater);
    add(b.scheduled.updater);
    add(b.crates.updater);
    add(b.explosions.updater);
    add(b.unlock.updater);
    add((_dt, s) => {
      if (s) b.view.water?.setLevel(s.snapshot.terrain.waterLevel);
    });
    add(b.splashes.updater);
    add((dt) => b.material.scorch.advance(dt));
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

  /** Sets where tech `visual` payloads come from (the content registry's technologies). */
  setTechVisuals(lookup: TechVisualLookup): void {
    this.research.setLookup(lookup);
  }

  /**
   * Feeds the snapshot's public per-team research entries (shimmer flag, researched ids). Safe to
   * call on every snapshot; absolute, so a late joiner shows the right shells without replay.
   */
  setResearchTeams(teams: readonly TeamResearchInput[] | undefined): void {
    this.research.setTeams(teams);
  }

  /** Applies a catch-up terrain history silently (no effects); the mesh rebuilds in one budgeted pass. */
  applyTerrainHistory(events: readonly SimEvent[]): void {
    this.built?.replica.applyHistory(events);
  }

  /** Fans events out to the terrain replica and explosion effects. */
  handleEvents(events: readonly SimEvent[]): void {
    this.built?.replica.applyEvents(events);
    this.built?.explosions.handleEvents(events);
    this.built?.strands.handleEvents(events);
    this.built?.crates.handleEvents(events);
    this.built?.snails.handleEvents(events);
    this.built?.unlock.handleEvents(events);
    const scorch = this.built?.material.scorch;
    if (!scorch) return;
    for (const e of events) {
      if (e.type === 'explosion') scorch.add(e.position.x, e.position.y, e.position.z, e.radius);
    }
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
    b.props?.setShadows(b.view.quality.shadows);
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
    b.props?.dispose();
    b.projectiles.dispose();
    b.areas.dispose();
    b.hill.dispose();
    b.strands.dispose();
    b.scheduled.dispose();
    b.crates.dispose();
    b.explosions.dispose();
    b.splashes.dispose();
    b.unlock.dispose();
    b.wind.dispose();
    b.material.dispose();
    b.view.dispose();
  }

  /** Builds the cosmetic prop layer when a model URL prefix is configured. */
  private makeProps(grid: SdfGrid, waterLevel: number, count: number, shadows: boolean) {
    const baseUrl = this.deps.modelBaseUrl;
    if (!baseUrl || count <= 0) return null;
    const loader = this.deps.modelLoader ?? (this.ownedLoader ??= createGltfModelLoader());
    return new PropLayer({ grid, waterLevel, count, baseUrl, loader, shadows });
  }

  /** Disposes everything. */
  dispose(): void {
    this.teardown();
    this.ownedLoader?.dispose();
    this.ownedLoader = null;
  }
}

/** Camera rig framing the island (overview extent 0.8 x map span) with terrain-aware clamping. */
function createRig(
  camera: THREE.PerspectiveCamera,
  grid: SdfGrid,
  extra: Partial<CameraRigOptions> = {},
): CameraRig {
  const ws = grid.worldSize();
  return new CameraRig(camera, {
    mode: 'follow',
    shot: { kind: 'overview', rate: 0.05, extent: Math.max(ws.x, ws.z) * 0.8 },
    bounds: { min: { x: -20, y: 0, z: -20 }, max: { x: ws.x + 20, y: ws.y + 40, z: ws.z + 20 } },
    heightAt: (x, z) => groundHeight(grid, x, z),
    ...extra,
  });
}
