/** Owns one Three.js mesh per terrain chunk, fed by a worker mesher. */
import * as THREE from 'three';
import type { SdfGrid } from '@snails/core';
import { DirtyChunkQueue, type ChunkJob } from './dirty-chunk-queue.js';
import { extractChunkInput } from './marching-cubes.js';
import { requestTransferables, type MeshResponse } from './mesh-protocol.js';
import type { MeshTransport } from './mesh-transport.js';
import { RebuildScheduler, type NowFn, type RebuildStats } from './rebuild-scheduler.js';

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
  /** Chunks cast and receive shadows (default false). */
  readonly shadows?: boolean;
}

/** Manages chunk meshes: dirty tracking, dispatch, geometry lifecycle. */
export class TerrainMeshManager {
  /** Attach to `roots.terrain`. */
  readonly group = new THREE.Group();
  private readonly queue = new DirtyChunkQueue();
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly jobs = new Map<number, ChunkJob>();
  private readonly material: THREE.Material;
  private readonly ownsMaterial: boolean;
  private readonly maxInFlight: number;
  private readonly scheduler: RebuildScheduler;
  private readonly results: { job: ChunkJob; res: MeshResponse }[] = [];
  private focus: THREE.Vector3 | null = null;
  private nextId = 1;
  private disposed = false;

  /** Creates the manager and subscribes to the transport. */
  constructor(private readonly opts: TerrainMeshManagerOptions) {
    this.group.name = 'terrain-chunks';
    this.ownsMaterial = !opts.material;
    this.material = opts.material ?? new THREE.MeshStandardMaterial({ color: 0x8a7a5a });
    this.maxInFlight = opts.maxInFlight ?? 4;
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
    this.scheduler.beginFrame();
    this.queue.markDirtyFrom(this.opts.grid);
    this.applyResults();
    this.pump();
    this.scheduler.endFrame(this.queue.pendingCount + this.results.length);
  }

  private applyResults(): void {
    if (this.results.length === 0) return;
    const pri = new Map(this.results.map((r) => [r, this.priority(r.res.chunkKey)]));
    this.results.sort((a, b) => (pri.get(a) as number) - (pri.get(b) as number));
    while (this.results.length > 0 && this.scheduler.canStart()) {
      const { job, res } = this.results.shift() as { job: ChunkJob; res: MeshResponse };
      if (this.queue.complete(job)) this.apply(res);
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
    while (this.maxInFlight - this.queue.inFlightCount > 0 && this.scheduler.canStart()) {
      const [job] = this.queue.take(1, (k) => this.priority(k));
      if (!job) return;
      const cx = job.key % grid.chunksX;
      const cy = Math.floor(job.key / grid.chunksX) % grid.chunksY;
      const cz = Math.floor(job.key / (grid.chunksX * grid.chunksY));
      const input = extractChunkInput(grid, cx, cy, cz);
      const id = this.nextId++;
      this.jobs.set(id, job);
      const req = { id, chunkKey: job.key, input };
      transport.post(req, requestTransferables(req));
      this.scheduler.record('dispatch');
    }
  }

  private onResult(res: MeshResponse): void {
    const job = this.jobs.get(res.id);
    if (!job || this.disposed) return;
    this.jobs.delete(res.id);
    this.results.push({ job, res });
  }

  private apply(res: MeshResponse): void {
    const { positions, normals, indices } = res.mesh;
    const existing = this.meshes.get(res.chunkKey);
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
    mesh.castShadow = mesh.receiveShadow = this.opts.shadows ?? false;
    this.meshes.set(res.chunkKey, mesh);
    this.group.add(mesh);
  }

  private remove(key: number, mesh: THREE.Mesh): void {
    this.group.remove(mesh);
    mesh.geometry.dispose();
    this.meshes.delete(key);
  }

  /** Frees all geometries, terminates the transport and ignores later results. */
  dispose(): void {
    this.disposed = true;
    for (const [key, mesh] of [...this.meshes]) this.remove(key, mesh);
    this.queue.clear();
    this.jobs.clear();
    this.results.length = 0;
    this.opts.transport.terminate();
    if (this.ownsMaterial) this.material.dispose();
  }
}
