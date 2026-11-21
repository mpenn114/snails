import type { FallenCluster, SdfGrid, SimEvent } from '@snails/core';

/** Minimal dirty-marking surface of a mesh manager (or anything remeshing chunks). */
export interface ChunkDirtyTarget {
  /** Marks one chunk as needing a remesh. */
  markDirty(id: number): void;
}

/** Options for {@link TerrainReplica}. */
export interface TerrainReplicaOptions {
  /** Render-owned grid copy (the one the mesh manager meshes). */
  grid: SdfGrid;
  /** Receives dirty chunks directly; optional because the grid's own dirty flags also work. */
  target?: ChunkDirtyTarget;
  /** Called once per applied collapse, e.g. to animate falling debris. */
  onFallen?: (clusters: readonly FallenCluster[]) => void;
}

/**
 * Render-local copy of the terrain that applies server events. It never calls core's mutating
 * terrain functions; the sphere subtraction is re-implemented to be bit-identical to core's.
 */
export class TerrainReplica {
  readonly grid: SdfGrid;
  private readonly seen = new WeakSet<object>();

  /** Wraps the grid copy. */
  constructor(private readonly opts: TerrainReplicaOptions) {
    this.grid = opts.grid;
  }

  /** Applies relevant events (carve, collapse); everything else and repeats are ignored. */
  applyEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (this.seen.has(e)) continue;
      if (e.type === 'terrainCarved') {
        this.seen.add(e);
        this.carve(e.centre, e.radius);
        this.markChunks(e.chunks);
      } else if (e.type === 'terrainCollapsed') {
        this.seen.add(e);
        for (const c of e.fallen) this.dropCluster(c);
        this.markChunks(e.chunks);
        this.opts.onFallen?.(e.fallen);
      }
    }
  }

  /** CSG difference of a sphere: `max(old, radius - distance)` per cell. */
  private carve(c: { x: number; y: number; z: number }, radius: number): void {
    if (!(radius > 0)) return;
    const g = this.grid;
    const cs = g.cellSize;
    const lo = (v: number): number => Math.max(0, Math.floor((v - radius) / cs));
    const hi = (v: number, n: number): number => Math.min(n - 1, Math.ceil((v + radius) / cs));
    for (let z = lo(c.z); z <= hi(c.z, g.nz); z++) {
      for (let y = lo(c.y); y <= hi(c.y, g.ny); y++) {
        for (let x = lo(c.x); x <= hi(c.x, g.nx); x++) {
          const d = Math.hypot(x * cs - c.x, y * cs - c.y, z * cs - c.z);
          const old = g.get(x, y, z);
          const next = Math.fround(Math.max(old, radius - d));
          if (next !== old) g.set(x, y, z, next);
        }
      }
    }
  }

  /**
   * Moves the solid cells of a fallen cluster from its pre-fall box to its landed box. The event
   * carries only the landed bounds and drop, so solid cells inside the pre-fall box are treated as
   * the cluster (exact for convex clusters; attached terrain inside the box would move too).
   */
  private dropCluster(c: FallenCluster): void {
    const g = this.grid;
    const { min, max } = c.bounds;
    const drop = c.dropCells;
    const moved: { x: number; y: number; z: number; v: number }[] = [];
    for (let z = min.z; z <= max.z; z++) {
      for (let y = min.y + drop; y <= max.y + drop; y++) {
        for (let x = min.x; x <= max.x; x++) {
          const v = g.get(x, y, z);
          if (v < 0) moved.push({ x, y, z, v });
        }
      }
    }
    for (const m of moved) g.set(m.x, m.y, m.z, 1);
    for (const m of moved) g.set(m.x, m.y - drop, m.z, Math.min(g.get(m.x, m.y - drop, m.z), m.v));
  }

  /** Marks event chunks plus their border neighbours (halo) dirty. */
  private markChunks(ids: readonly number[]): void {
    const t = this.opts.target;
    if (!t) return;
    const g = this.grid;
    for (const id of ids) {
      const cx = id % g.chunksX;
      const cy = Math.floor(id / g.chunksX) % g.chunksY;
      const cz = Math.floor(id / (g.chunksX * g.chunksY));
      for (let dz = -1; dz <= 1; dz++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const n = g.chunkIdAt(cx + dx, cy + dy, cz + dz);
            if (n >= 0) t.markDirty(n);
          }
    }
  }
}
