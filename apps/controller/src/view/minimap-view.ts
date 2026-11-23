import type { GameSnapshot } from '@snails/core';
import {
  RefreshGate,
  makeProjection,
  minimapDots,
  sampleHeights,
  silhouetteRgba,
  windArrow,
} from './minimap';
import type { HeightGridLike, MinimapProjection } from './minimap';

const SAMPLES = 64;
const SIZE = 112;

/** Minimap options. */
export interface MinimapOptions {
  /** Called with the tapped world position. */
  onTap: (x: number, z: number) => void;
  now?: () => number;
  /** Minimum ms between terrain re-samples. */
  terrainIntervalMs?: number;
}

/**
 * Top-down minimap canvas: terrain silhouette (re-sampled at most every `terrainIntervalMs`
 * after a carve), snail/projectile dots, wind arrow. Tapping reports the world position.
 */
export class MinimapView {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly terrain: HTMLCanvasElement;
  private readonly gate: RefreshGate;
  private proj: MinimapProjection;
  private grid: HeightGridLike | null = null;
  private readonly onPointer = (e: PointerEvent): void => {
    const r = this.canvas.getBoundingClientRect();
    const p = this.proj.toWorld(
      ((e.clientX - r.left) / r.width) * SIZE,
      ((e.clientY - r.top) / r.height) * SIZE,
    );
    this.opts.onTap(p.x, p.z);
  };

  constructor(
    doc: Document,
    private readonly opts: MinimapOptions,
  ) {
    this.canvas = doc.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.canvas.style.cssText = `width:${SIZE}px;height:${SIZE}px;pointer-events:auto;touch-action:none;background:rgba(var(--snl-ink-rgb),0.6);border-radius:var(--snl-radius)`;
    this.ctx = this.canvas.getContext('2d');
    this.terrain = doc.createElement('canvas');
    this.terrain.width = SAMPLES;
    this.terrain.height = SAMPLES;
    this.gate = new RefreshGate(
      opts.terrainIntervalMs ?? 500,
      opts.now ?? (() => performance.now()),
    );
    this.proj = makeProjection(1, 1, SIZE, SIZE);
    this.canvas.addEventListener('pointerdown', this.onPointer);
  }

  /** Sets the terrain to sample (the render-owned replica grid). */
  setGrid(grid: HeightGridLike): void {
    this.grid = grid;
    this.proj = makeProjection(
      (grid.nx - 1) * grid.cellSize,
      (grid.nz - 1) * grid.cellSize,
      SIZE,
      SIZE,
    );
    this.gate.request();
  }

  /** Marks the terrain changed (a carve or collapse event). */
  terrainChanged(): void {
    this.gate.request();
  }

  /** Redraws from a snapshot. */
  draw(snapshot: GameSnapshot): void {
    const ctx = this.ctx;
    if (!ctx || !this.grid) return;
    if (this.gate.due()) this.resample(this.grid);
    ctx.clearRect(0, 0, SIZE, SIZE);
    const a = this.proj.toMap(0, 0);
    const b = this.proj.toMap(
      (this.grid.nx - 1) * this.grid.cellSize,
      (this.grid.nz - 1) * this.grid.cellSize,
    );
    ctx.drawImage(this.terrain, a.x, a.y, b.x - a.x, b.y - a.y);
    for (const d of minimapDots(snapshot, this.proj)) {
      ctx.fillStyle = d.colour;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.kind === 'projectile' ? 2 : d.active ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (d.active) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    this.drawWind(ctx, snapshot.wind);
  }

  /** Removes listeners and the canvas. */
  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    this.canvas.remove();
  }

  private resample(grid: HeightGridLike): void {
    const c = this.terrain.getContext('2d');
    if (!c) return;
    const rgba = silhouetteRgba(sampleHeights(grid, SAMPLES, SAMPLES));
    const image = c.createImageData(SAMPLES, SAMPLES);
    image.data.set(rgba);
    c.putImageData(image, 0, 0);
  }

  private drawWind(ctx: CanvasRenderingContext2D, wind: GameSnapshot['wind']): void {
    const w = windArrow(wind);
    if (w.length <= 0.02) return;
    const cx = SIZE - 18;
    const cy = 18;
    const len = 6 + 10 * w.length;
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - w.dx * len, cy - w.dy * len);
    ctx.lineTo(cx + w.dx * len, cy + w.dy * len);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + w.dx * len, cy + w.dy * len, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe9a8';
    ctx.fill();
  }
}
