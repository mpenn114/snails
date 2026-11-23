import { describe, expect, it } from 'vitest';
import { createFrameStats } from './frame-stats.js';
import { formatOverlay } from './overlay.js';

describe('formatOverlay', () => {
  it('includes fps, chunk, draw and snail info', () => {
    const frames = createFrameStats();
    frames.record(20);
    const text = formatOverlay({
      frames,
      rebuild: null,
      calls: 12,
      triangles: 3456,
      snails: 16,
      tier: 'low',
      ticks: 99,
      geometries: 40,
      textures: 5,
      timings: { avgUpdateMs: 1.25, avgRenderMs: 3.5 },
    });
    expect(text).toContain('FPS 50.0');
    expect(text).toContain('backlog 0');
    expect(text).toContain('draw calls 12  triangles 3456');
    expect(text).toContain('geometries 40  textures 5');
    expect(text).toContain('update 1.25 ms  render 3.50 ms');
    expect(text).toContain('snails 16  tier low');
  });
});
