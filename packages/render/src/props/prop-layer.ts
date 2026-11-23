import * as THREE from 'three';
import type { SdfGrid } from '@snails/core';
import type { FrameUpdater, RenderState } from '../render-loop.js';
import { snailViewsFromSnapshot } from '../snail-view.js';
import type { ModelAsset, ModelLoader } from './model-loader.js';
import { getToonMaterial } from '../style/materials.js';
import {
  MODEL_CAP_COLORS,
  PROP_KINDS,
  hasGround,
  planProps,
  seedFromGrid,
  type PropKind,
  type PropPlacement,
} from './prop-plan.js';

/** Options for {@link PropLayer}. */
export interface PropLayerOptions {
  /** The render-owned terrain copy (props ask it where the ground is; it is never mutated). */
  grid: SdfGrid;
  waterLevel: number;
  /** Props to place (from the quality tier); 0 disables the layer. */
  count: number;
  /** URL prefix of the model files, ending in `/`. */
  baseUrl: string;
  loader: ModelLoader;
  /** Cosmetic seed; defaults to a hash of the terrain. */
  seed?: number;
  shadows?: boolean;
  kinds?: readonly PropKind[];
}

/** Frames between ground checks (cheap: a few hundred field samples). */
const CHECK_EVERY = 4;
const SINK = 0.03;
const UP = new THREE.Vector3(0, 1, 0);

interface Batch {
  mesh: THREE.InstancedMesh;
  /** Placements of this kind that are still alive, in instance order. */
  alive: PropPlacement[];
}

/**
 * Cosmetic scenery scattered on the terrain surface, drawn as one InstancedMesh per model part.
 * Models load asynchronously (the first frame never waits); props appear once everything is
 * loaded and the first snapshot has told us where snails stand (kept clear of them). A prop is
 * removed when the ground under it is carved away. Never read by the simulation.
 */
export class PropLayer {
  /** Attach this to the entities root. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: starts the build once ready and prunes carved props. */
  readonly updater: FrameUpdater;
  private readonly kinds: readonly PropKind[];
  private readonly batches = new Map<number, Batch[]>();
  private assets: (ModelAsset | null)[] | null = null;
  private frame = 0;
  private done = false;
  private shadows: boolean;
  private disposed = false;

  /** Starts loading the models; nothing is drawn until they arrive. */
  constructor(private readonly opts: PropLayerOptions) {
    this.kinds = opts.kinds ?? PROP_KINDS;
    this.shadows = opts.shadows ?? false;
    this.group.name = 'props';
    this.done = opts.count <= 0;
    if (!this.done) void this.loadAll();
    this.updater = (_dt, state) => this.update(state);
  }

  /** True once props were built (or will never be: disabled or all loads failed). */
  get settled(): boolean {
    return this.done;
  }

  /** Live prop count. */
  get count(): number {
    return [...this.batches.values()].flat().reduce((n, b) => n + b.alive.length, 0);
  }

  /** Enables or disables shadow casting (only kinds flagged `castShadow` ever cast). */
  setShadows(on: boolean): void {
    this.shadows = on;
    for (const [i, row] of this.batches) {
      for (const b of row) b.mesh.castShadow = on && (this.kinds[i] as PropKind).castShadow;
    }
  }

  private async loadAll(): Promise<void> {
    const base = this.opts.baseUrl;
    const loaded = await Promise.all(
      this.kinds.map((k) => this.opts.loader.load(base + k.file).catch(() => null)),
    );
    if (this.disposed) return;
    this.assets = loaded;
    if (loaded.every((a) => a === null)) this.done = true;
  }

  private update(state: RenderState | null | undefined): void {
    if (this.disposed) return;
    if (!this.done && this.assets && state?.snapshot) {
      const avoid = snailViewsFromSnapshot(state.snapshot).map((v) => v.position);
      this.build(avoid);
      return;
    }
    if (this.done && ++this.frame % CHECK_EVERY === 0) this.prune();
  }

  /** Plans and builds all instanced meshes now (normally driven by the updater). */
  build(avoid: readonly { x: number; y: number; z: number }[] = []): void {
    if (this.done || !this.assets) return;
    const plan = planProps({
      grid: this.opts.grid,
      seed: this.opts.seed ?? seedFromGrid(this.opts.grid),
      count: this.opts.count,
      waterLevel: this.opts.waterLevel,
      avoid,
      kinds: this.kinds,
    });
    this.kinds.forEach((kind, i) => {
      const asset = this.assets?.[i];
      const mine = plan.filter((p) => p.kind === i);
      if (!asset || mine.length === 0) return;
      const variants = kind.capColors?.length ?? 1;
      const row: Batch[] = [];
      for (let v = 0; v < variants; v++) {
        const group = kind.capColors ? mine.filter((p) => p.variant === v) : mine;
        if (group.length === 0) continue;
        for (const part of asset.parts) {
          row.push(this.makeBatch(this.recolour(part, kind.capColors?.[v]), kind, group));
        }
      }
      this.batches.set(i, row);
      for (const b of row) this.group.add(b.mesh);
    });
    this.done = true;
  }

  /** Swaps a model's red/tan cap material for the variant's muted cap colour. */
  private recolour(part: ModelAsset['parts'][number], cap: number | undefined) {
    const colour = (part.material as THREE.MeshToonMaterial).color?.getHex();
    if (cap === undefined || colour === undefined) return part;
    if (!MODEL_CAP_COLORS.some((c) => sameColour(c, colour))) return part;
    return { ...part, material: getToonMaterial({ color: cap, flat: true }) };
  }

  private makeBatch(part: ModelAsset['parts'][number], kind: PropKind, placed: PropPlacement[]) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, placed.length);
    mesh.frustumCulled = false;
    mesh.castShadow = this.shadows && kind.castShadow;
    mesh.receiveShadow = true;
    const batch: Batch = { mesh, alive: [...placed] };
    this.write(batch, kind);
    return batch;
  }

  /** Rewrites a batch's instance buffers from its alive list (compacting removed props). */
  private write(batch: Batch, kind: PropKind): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tilt = new THREE.Quaternion();
    const n = new THREE.Vector3();
    const col = new THREE.Color();
    batch.alive.forEach((p, i) => {
      tilt
        .setFromUnitVectors(UP, n.set(p.normal.x, p.normal.y, p.normal.z))
        .slerp(q.identity(), 1 - kind.lean);
      q.setFromAxisAngle(UP, p.yaw).premultiply(tilt);
      m.compose(new THREE.Vector3(p.x, p.y - SINK, p.z), q, new THREE.Vector3().setScalar(p.scale));
      batch.mesh.setMatrixAt(i, m);
      if (kind.tint > 0) batch.mesh.setColorAt(i, col.setScalar(p.tint));
    });
    batch.mesh.count = batch.alive.length;
    batch.mesh.instanceMatrix.needsUpdate = true;
    if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
  }

  /** Drops props whose ground was carved or collapsed away. */
  private prune(): void {
    for (const [i, row] of this.batches) {
      for (const b of row) {
        const keep = b.alive.filter((p) => hasGround(this.opts.grid, p));
        if (keep.length === b.alive.length) continue;
        b.alive = keep;
        this.write(b, this.kinds[i] as PropKind);
      }
    }
  }

  /** Runs one ground check immediately (the updater does this every few frames). */
  pruneNow(): void {
    this.prune();
  }

  /** Removes the meshes; geometry belongs to the model loader and is freed there. */
  dispose(): void {
    this.disposed = true;
    for (const row of this.batches.values()) for (const b of row) b.mesh.dispose();
    this.batches.clear();
    this.group.clear();
    this.group.removeFromParent();
  }
}

/** True when two 24-bit colours are within rounding of each other (sRGB to linear to sRGB). */
function sameColour(a: number, b: number): boolean {
  const d = (s: number): number => Math.abs(((a >> s) & 255) - ((b >> s) & 255));
  return d(16) <= 2 && d(8) <= 2 && d(0) <= 2;
}
