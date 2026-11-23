import type { GameSnapshot } from '@snails/core';

/** The slice of an SDF grid the minimap samples (negative values are solid). */
export interface HeightGridLike {
  nx: number;
  ny: number;
  nz: number;
  cellSize: number;
  data: ArrayLike<number>;
}

/** World <-> minimap pixel mapping (top-down: world X to the right, world Z downwards). */
export interface MinimapProjection {
  toMap(x: number, z: number): { x: number; y: number };
  toWorld(px: number, py: number): { x: number; z: number };
}

/** Fits a `worldW` x `worldD` metre area into a `width` x `height` pixel box, centred. */
export function makeProjection(
  worldW: number,
  worldD: number,
  width: number,
  height: number,
): MinimapProjection {
  const scale = Math.min(width / worldW, height / worldD);
  const ox = (width - worldW * scale) / 2;
  const oy = (height - worldD * scale) / 2;
  return {
    toMap: (x, z) => ({ x: ox + x * scale, y: oy + z * scale }),
    toWorld: (px, py) => ({ x: (px - ox) / scale, z: (py - oy) / scale }),
  };
}

/**
 * Samples the highest solid cell of each sampled column into a `cols` x `rows` map of 0..255
 * (0 = no terrain, otherwise 1..255 proportional to height). Row-major, row 0 is world z = 0.
 */
export function sampleHeights(grid: HeightGridLike, cols: number, rows: number): Uint8Array {
  const out = new Uint8Array(cols * rows);
  const { nx, ny, nz, data } = grid;
  for (let r = 0; r < rows; r++) {
    const z = Math.min(nz - 1, Math.floor(((r + 0.5) / rows) * nz));
    for (let c = 0; c < cols; c++) {
      const x = Math.min(nx - 1, Math.floor(((c + 0.5) / cols) * nx));
      for (let y = ny - 1; y >= 0; y--) {
        if ((data[x + nx * (y + ny * z)] as number) < 0) {
          out[r * cols + c] = 1 + Math.floor((y / Math.max(1, ny - 1)) * 254);
          break;
        }
      }
    }
  }
  return out;
}

/** Converts sampled heights to RGBA pixels: brighter higher ground, transparent air. */
export function silhouetteRgba(heights: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(heights.length * 4);
  heights.forEach((h, i) => {
    if (h === 0) return;
    const t = h / 255;
    out[i * 4] = 70 + 90 * t;
    out[i * 4 + 1] = 100 + 110 * t;
    out[i * 4 + 2] = 55 + 40 * t;
    out[i * 4 + 3] = 255;
  });
  return out;
}

/** One dot on the minimap. */
export interface MinimapDot {
  x: number;
  y: number;
  kind: 'snail' | 'projectile';
  colour: string;
  active: boolean;
}

/** Snail and projectile dots (dead snails omitted) in minimap pixels. */
export function minimapDots(snapshot: GameSnapshot, proj: MinimapProjection): MinimapDot[] {
  const dots: MinimapDot[] = [];
  const activeId = snapshot.turn.activeSnailId;
  for (const team of snapshot.teams) {
    for (const s of team.snails) {
      if (!s.alive) continue;
      const p = proj.toMap(s.position.x, s.position.z);
      dots.push({ ...p, kind: 'snail', colour: team.colour, active: s.id === activeId });
    }
  }
  for (const pr of snapshot.projectiles) {
    const p = proj.toMap(pr.position.x, pr.position.z);
    dots.push({ ...p, kind: 'projectile', colour: '#ffffff', active: false });
  }
  return dots;
}

/**
 * Wind arrow in screen space (x right, y down) as a unit direction plus a length in 0..1
 * (`maxStrength` maps to 1). The core wind direction uses the snail facing convention, so the
 * world vector is (cos d, -sin d) on the (x, z) plane.
 */
export function windArrow(
  wind: { strength: number; direction: number },
  maxStrength = 10,
): { dx: number; dy: number; length: number } {
  return {
    dx: Math.cos(wind.direction),
    dy: -Math.sin(wind.direction),
    length: Math.min(1, Math.abs(wind.strength) / maxStrength),
  };
}

/** Throttle for expensive refreshes: `request()` marks dirty, `due()` fires at most once per interval. */
export class RefreshGate {
  private dirty = true;
  private last = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number,
  ) {}

  /** Marks the data as changed. */
  request(): void {
    this.dirty = true;
  }

  /** True (once) when changed and the interval has passed. */
  due(): boolean {
    const t = this.now();
    if (!this.dirty || t - this.last < this.intervalMs) return false;
    this.dirty = false;
    this.last = t;
    return true;
  }
}
