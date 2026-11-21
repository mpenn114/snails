/** Dirty-chunk bookkeeping: dedupe, versioning, priority and in-flight tracking. */
import type { SdfGrid } from '@snails/core';

/** A chunk checked out for meshing. */
export interface ChunkJob {
  readonly key: number;
  readonly version: number;
}

/** Lower value = meshed sooner. */
export type ChunkPriority = (key: number) => number;

/** Queue of chunks needing a (re)mesh. */
export class DirtyChunkQueue {
  private readonly pending = new Set<number>();
  private readonly latest = new Map<number, number>();
  private readonly inFlight = new Map<number, number>();

  /** Marks a chunk dirty; bumps its version so in-flight results become stale. */
  markDirty(key: number): void {
    this.latest.set(key, (this.latest.get(key) ?? 0) + 1);
    this.pending.add(key);
  }

  /** Reads and clears the grid's dirty flags, enqueueing each chunk. Returns the count. */
  markDirtyFrom(grid: SdfGrid): number {
    const ids = grid.takeDirtyChunks();
    for (const id of ids) this.markDirty(id);
    return ids.length;
  }

  /** Number of chunks waiting to be dispatched. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** Number of chunks currently being meshed. */
  get inFlightCount(): number {
    return this.inFlight.size;
  }

  /**
   * Checks out up to `max` pending chunks (not already in flight), best priority first.
   * Chunks dirtied while in flight stay pending until their current job completes.
   */
  take(max: number, priority?: ChunkPriority): ChunkJob[] {
    const keys = [...this.pending].filter((k) => !this.inFlight.has(k));
    if (priority) keys.sort((a, b) => priority(a) - priority(b) || a - b);
    else keys.sort((a, b) => a - b);
    const jobs: ChunkJob[] = [];
    for (const key of keys.slice(0, Math.max(0, max))) {
      const version = this.latest.get(key) ?? 0;
      this.pending.delete(key);
      this.inFlight.set(key, version);
      jobs.push({ key, version });
    }
    return jobs;
  }

  /** Completes a job. Returns true when the result is current, false when stale. */
  complete(job: ChunkJob): boolean {
    if (this.inFlight.get(job.key) !== job.version) return false;
    this.inFlight.delete(job.key);
    return this.latest.get(job.key) === job.version;
  }

  /** Drops all state. */
  clear(): void {
    this.pending.clear();
    this.latest.clear();
    this.inFlight.clear();
  }
}
