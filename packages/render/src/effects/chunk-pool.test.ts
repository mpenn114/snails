import { describe, expect, it } from 'vitest';
import {
  chunkCount,
  createChunkPool,
  emitChunk,
  stepChunks,
  type ChunkSpec,
} from './chunk-pool.js';

const spec = (over: Partial<ChunkSpec> = {}): ChunkSpec => ({
  x: 0,
  y: 1,
  z: 0,
  vx: 2,
  vy: 0,
  vz: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  sx: 1,
  sy: 0,
  sz: 0,
  size: 0.2,
  colour: 0xff8040,
  life: 1,
  floorY: 0,
  ...over,
});
const ballistic = { gravity: 10, drag: 0, restitution: 0.5 };

describe('chunk pool', () => {
  it('emits, ages and expires', () => {
    const p = createChunkPool(4);
    emitChunk(p, spec());
    expect(chunkCount(p)).toBe(1);
    stepChunks(p, 0.5, ballistic);
    expect(chunkCount(p)).toBe(1);
    expect(p.pos[0]).toBeCloseTo(1);
    expect(p.rot[0]).toBeCloseTo(0.5);
    stepChunks(p, 0.6, ballistic);
    expect(chunkCount(p)).toBe(0);
  });

  it('stores the sRGB colour as 0..1 floats', () => {
    const p = createChunkPool(2);
    emitChunk(p, spec({ colour: 0xff8040 }));
    expect(p.colour[0]).toBeCloseTo(1);
    expect(p.colour[1]).toBeCloseTo(0x80 / 255);
  });

  it('recycles the oldest slot when full', () => {
    const p = createChunkPool(3);
    for (let i = 0; i < 5; i++) emitChunk(p, spec({ x: i }));
    expect(chunkCount(p)).toBe(3);
    expect(p.pos[0]).toBe(3);
  });

  it('bounces once off the floor then rests', () => {
    const p = createChunkPool(1);
    emitChunk(p, spec({ y: 0.3, vy: -6, vx: 0, life: 5 }));
    let maxUpAfterBounce = 0;
    let bounced = false;
    for (let i = 0; i < 300; i++) {
      stepChunks(p, 1 / 60, ballistic);
      if ((p.bounces[0] ?? 0) === 1) bounced = true;
      if (bounced) maxUpAfterBounce = Math.max(maxUpAfterBounce, p.vel[1] ?? 0);
    }
    expect(bounced).toBe(true);
    expect(maxUpAfterBounce).toBeGreaterThan(1);
    expect(p.pos[1]).toBeGreaterThanOrEqual(0);
    expect(p.pos[1]).toBeLessThan(0.05);
  });

  it('buoyant chunks rise and ignore the floor', () => {
    const p = createChunkPool(1);
    emitChunk(p, spec({ vx: 0, y: 0 }));
    stepChunks(p, 0.5, { gravity: -2, drag: 0, restitution: 0 });
    expect(p.pos[1]).toBeGreaterThan(0);
  });
});
