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
    });
    expect(text).toContain('FPS 50.0');
    expect(text).toContain('backlog 0');
    expect(text).toContain('draw calls 12  triangles 3456');
    expect(text).toContain('snails 16  tier low');
  });
});
