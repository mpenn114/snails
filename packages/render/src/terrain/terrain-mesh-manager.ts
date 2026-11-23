import { PALETTE } from '../style/palette.js';
/** Owns one Three.js mesh per terrain chunk, fed by a worker mesher. */
import * as THREE from 'three';
import type { SdfGrid } from '@snails/core';
import { DirtyChunkQueue, type ChunkJob } from './dirty-chunk-queue.js';
import { isChunkTrivial, selectLodStep, type LodStep } from './chunk-lod.js';
import { extractChunkInput } from './marching-cubes.js';
import { requestTransferables, type MeshResponse } from './mesh-protocol.js';
import type { MeshTransport } from './mesh-transport.js';
import {
  DEFAULT_REBUILD_BUDGET_MS,
  RebuildScheduler,
  type NowFn,
  type RebuildStats,
} from './rebuild-scheduler.js';

/** Max LOD-change remeshes queued per frame. */
const LOD_REQUEUE_PER_FRAME = 4;

/** Options for {@link TerrainMeshManager}. */
export interface TerrainMeshManagerOptions {
  readonly grid: SdfGrid;
  readonly transport: MeshTransport;
  /** Material shared by all chunks (not disposed by the manager). */
  readonly material?: THREE.Material;
  /** Max concurrent mesh requests (default 4). */
  readonly maxInFlight?: number;
  /** Main-thread rebuild budget per frame in ms (default 8; lower on mobile). */
  readonly budgetMs?: number;
  /** Clock in ms (default `performance.now`); injectable for tests. */
  readonly now?: NowFn;
  /** Max concurrent mesh requests during the initial full build (default 16). */
  readonly initialMaxInFlight?: number;
  /** Per-frame budget in ms during the initial full build (default max(16, 3x budgetMs)). */
  readonly initialBudgetMs?: number;
  /** Chunks farther than this from the focus (metres) use the coarse LOD; 0/Infinity = off. */
  readonly lodDistance?: number;
  /** Chunks cast and receive shadows (default false). */
  readonly shadows?: boolean;
}

/** Manages chunk meshes: dirty tracking, dispatch, geometry lifecycle. */
export class TerrainMeshManager {
  /** Attach to `roots.terrain`. */
  readonly group = new THREE.Group();
  private readonly queue = new DirtyChunkQueue();
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly jobs = new Map<number, { job: ChunkJob; step: LodStep }>();
  private readonly steps = new Map<number, LodStep>();
  private readonly lodDistance: number;
  private readonly lodStale = new Set<number>();
  private lodFocus: THREE.Vector3 | null = null;
  private readonly initialKeys = new Set<number>();
  private readonly material: THREE.Material;
  private readonly ownsMaterial: boolean;
  private readonly maxInFlight: number;
  private readonly scheduler: RebuildScheduler;
  private readonly results: { job: ChunkJob; res: MeshResponse; step: LodStep }[] = [];
  private focus: THREE.Vector3 | null = null;
  private nextId = 1;
  private disposed = false;
  private shadows: boolean;

  /** Creates the manager and subscribes to the transport. */
  constructor(private readonly opts: TerrainMeshManagerOptions) {
    this.group.name = 'terrain-chunks';
    this.shadows = opts.shadows ?? false;
    this.ownsMaterial = !opts.material;
    this.material = opts.material ?? new THREE.MeshStandardMaterial({ color: PALETTE.soil });
    this.maxInFlight = opts.maxInFlight ?? 4;
    this.lodDistance = opts.lodDistance ?? 0;
    this.scheduler = new RebuildScheduler(opts.budgetMs, opts.now);
    opts.transport.onMessage((res) => this.onResult(res));
  }

  /** Sets the point (world metres) nearest chunks are meshed first; null for id order. */
  setFocus(p: THREE.Vector3 | null): void {
    this.focus = p;
  }

  /** Marks every chunk dirty (initial build). */
  markAllDirty(): void {
    for (const id of this.opts.grid.chunkIds()) this.queue.markDirty(id);
    for (const id of this.opts.grid.chunkIds()) this.initialKeys.add(id);
  }

  /** Number of chunks with a live mesh. */
  get meshCount(): number {
    return this.meshes.size;
  }

  /** True when nothing is pending or in flight. */
  get idle(): boolean {
    return this.queue.pendingCount === 0 && this.queue.inFlightCount === 0;
  }

  /** Mesh for a chunk, if any. */
  getMesh(key: number): THREE.Mesh | undefined {
    return this.meshes.get(key);
  }

  /** Rebuild statistics (frame time, backlog, stalls). */
  get stats(): RebuildStats {
    return this.scheduler.stats;
  }

  /** Pulls dirty flags, applies finished meshes then dispatches work, within the frame budget. */
  update(dt?: number): void {
    void dt; // reserved: frame delta (budget is wall-clock based)
    if (this.disposed) return;
    if (this.initialKeys.size > 0 && this.idle) this.initialKeys.clear();
    this.scheduler.setBudget(
      this.initialKeys.size > 0
        ? this.initialBudget()
        : (this.opts.budgetMs ?? DEFAULT_REBUILD_BUDGET_MS),
    );
    this.scheduler.beginFrame();
    this.queue.markDirtyFrom(this.opts.grid);
    this.refreshLod();
    this.applyResults();
    this.pump();
    this.scheduler.endFrame(this.queue.pendingCount + this.results.length);
  }

  private initialBudget(): number {
    const b = this.opts.budgetMs ?? DEFAULT_REBUILD_BUDGET_MS;
    return this.opts.initialBudgetMs ?? Math.max(16, b * 3);
  }

  /**
   * Re-queues meshed chunks whose desired LOD changed after the focus moved, a few per frame,
   * nearest first, and only while the main queue is empty (LOD upkeep never starves real edits).
   */
  private refreshLod(): void {
    const f = this.focus;
    if (this.lodDistance <= 0 || !f || this.initialKeys.size > 0) return;
    if (!this.lodFocus || this.lodFocus.distanceToSquared(f) >= 64) {
      this.lodFocus = f.clone();
      for (const [key, cur] of this.steps) if (this.wantedStep(key) !== cur) this.lodStale.add(key);
    }
    if (this.lodStale.size === 0 || this.queue.pendingCount > 0) return;
    const keys = [...this.lodStale].sort((x, y) => this.priority(x) - this.priority(y));
    for (const key of keys.slice(0, LOD_REQUEUE_PER_FRAME)) {
      this.lodStale.delete(key);
      if (this.steps.has(key) && this.wantedStep(key) !== this.steps.get(key)) {
        this.queue.markDirty(key);
      }
    }
  }

  private wantedStep(key: number): LodStep {
    if (this.lodDistance <= 0 || !this.focus) return 1;
    return selectLodStep(this.priority(key), this.lodDistance, this.steps.get(key));
  }

  private applyResults(): void {
    if (this.results.length === 0) return;
    const pri = new Map(this.results.map((r) => [r, this.priority(r.res.chunkKey)]));
    this.results.sort((a, b) => (pri.get(a) as number) - (pri.get(b) as number));
    while (this.results.length > 0 && this.scheduler.canStart()) {
      const { job, res, step } = this.results.shift() as (typeof this.results)[number];
      if (this.queue.complete(job)) {
        this.initialKeys.delete(job.key);
        this.apply(res, step);
      }
      this.scheduler.record('apply');
    }
  }

  private priority(key: number): number {
    const f = this.focus;
    if (!f) return 0;
    const { grid } = this.opts;
    const { min, max } = grid.chunkBounds(key);
    const h = grid.cellSize / 2;
    return Math.hypot(
      (min.x + max.x) * h - f.x,
      (min.y + max.y) * h - f.y,
      (min.z + max.z) * h - f.z,
    );
  }

  private pump(): void {
    const { grid, transport } = this.opts;
    const limit =
      this.initialKeys.size > 0 ? (this.opts.initialMaxInFlight ?? 16) : this.maxInFlight;
    while (limit - this.queue.inFlightCount > 0 && this.scheduler.canStart()) {
      const [job] = this.queue.take(1, (k) => this.priority(k));
      if (!job) return;
      const cx = job.key % grid.chunksX;
      const cy = Math.floor(job.key / grid.chunksX) % grid.chunksY;
      const cz = Math.floor(job.key / (grid.chunksX * grid.chunksY));
      if (isChunkTrivial(grid, cx, cy, cz)) {
        this.skipTrivial(job);
        continue;
      }
      const step = this.wantedStep(job.key);
      const input = extractChunkInput(grid, cx, cy, cz, step);
      const id = this.nextId++;
      this.jobs.set(id, { job, step });
      const req = { id, chunkKey: job.key, input };
      transport.post(req, requestTransferables(req));
      this.scheduler.record('dispatch');
    }
  }

  /** Chunk with no surface: never dispatched; drops any existing mesh. */
  private skipTrivial(job: ChunkJob): void {
    this.scheduler.record('skip');
    if (!this.queue.complete(job)) return;
    this.initialKeys.delete(job.key);
    const existing = this.meshes.get(job.key);
    if (existing) this.remove(job.key, existing);
  }

  private onResult(res: MeshResponse): void {
    const entry = this.jobs.get(res.id);
    if (!entry || this.disposed) return;
    this.jobs.delete(res.id);
    this.results.push({ job: entry.job, res, step: entry.step });
  }

  private apply(res: MeshResponse, step: LodStep): void {
    const { positions, normals, indices } = res.mesh;
    const existing = this.meshes.get(res.chunkKey);
    this.steps.set(res.chunkKey, step);
    if (indices.length === 0) {
      if (existing) this.remove(res.chunkKey, existing);
      return;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeBoundingSphere();
    if (existing) {
      existing.geometry.dispose();
      existing.geometry = geo;
      return;
    }
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.name = `chunk-${res.chunkKey}`;
    mesh.castShadow = mesh.receiveShadow = this.shadows;
    this.meshes.set(res.chunkKey, mesh);
    this.group.add(mesh);
  }

  /** Enables or disables shadow casting/receiving on all existing and future chunk meshes. */
  setShadows(on: boolean): void {
    this.shadows = on;
    for (const mesh of this.meshes.values()) mesh.castShadow = mesh.receiveShadow = on;
  }

  private remove(key: number, mesh: THREE.Mesh): void {
    this.group.remove(mesh);
    mesh.geometry.dispose();
    this.meshes.delete(key);
    this.steps.delete(key);
  }

  /** Frees all geometries, terminates the transport and ignores later results. */
  dispose(): void {
    this.disposed = true;
    for (const [key, mesh] of [...this.meshes]) this.remove(key, mesh);
    this.queue.clear();
    this.jobs.clear();
    this.steps.clear();
    this.lodStale.clear();
    this.results.length = 0;
    this.opts.transport.terminate();
    if (this.ownsMaterial) this.material.dispose();
  }
}
