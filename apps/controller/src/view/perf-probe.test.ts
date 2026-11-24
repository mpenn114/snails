import { describe, expect, it } from 'vitest';
import { createPerfProbe, perfProbeRequested, samplePerf, type PerfSample } from './perf-probe';

const gl = {
  info: {
    render: { calls: 7, triangles: 900 },
    memory: { geometries: 3, textures: 2 },
    programs: [1, 2],
  },
};

describe('perf probe', () => {
  it('samples renderer info', () => {
    expect(samplePerf(gl)).toEqual({
      calls: 7,
      triangles: 900,
      geometries: 3,
      textures: 2,
      programs: 2,
    });
    expect(samplePerf({ info: { ...gl.info, programs: null } }).programs).toBe(0);
  });

  it('detects the query flag', () => {
    expect(perfProbeRequested('?perf=1')).toBe(true);
    expect(perfProbeRequested('?room=ABCD')).toBe(false);
  });

  it('publishes about twice a second', () => {
    const target: { __perf?: PerfSample } = {};
    const tick = createPerfProbe(gl, target);
    tick(0.2);
    expect(target.__perf).toBeUndefined();
    tick(0.4);
    expect(target.__perf).toMatchObject({ calls: 7 });
  });
});
