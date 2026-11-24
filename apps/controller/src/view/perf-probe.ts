/** The slice of `THREE.WebGLRenderer.info` the perf probe reads. */
export interface RendererInfoLike {
  info: {
    render: { calls: number; triangles: number };
    memory: { geometries: number; textures: number };
    programs?: readonly unknown[] | null;
  };
}

/** Counters published on `window.__perf` for scripted budget checks (`pnpm perf`). */
export interface PerfSample {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}

/** Reads the last-frame renderer counters. */
export function samplePerf(gl: RendererInfoLike): PerfSample {
  return {
    calls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
    geometries: gl.info.memory.geometries,
    textures: gl.info.memory.textures,
    programs: gl.info.programs?.length ?? 0,
  };
}

/** True when the page URL asks for the probe (`?perf=1`). */
export function perfProbeRequested(search: string): boolean {
  return new URLSearchParams(search).get('perf') === '1';
}

/**
 * Returns a per-frame updater that publishes {@link PerfSample} to `target.__perf` about twice a
 * second. Diagnostics only; nothing reads it in the app.
 */
export function createPerfProbe(
  gl: RendererInfoLike,
  target: { __perf?: PerfSample },
): (dt: number) => void {
  let acc = 0;
  return (dt) => {
    acc += dt;
    if (acc < 0.5) return;
    acc = 0;
    target.__perf = samplePerf(gl);
  };
}
