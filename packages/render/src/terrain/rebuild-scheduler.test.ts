import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SdfGrid } from '@snails/core';
import { handleMeshRequest, type MeshRequest, type MeshResponse } from './mesh-protocol.js';
import type { MeshTransport } from './mesh-transport.js';
import { RebuildScheduler } from './rebuild-scheduler.js';
import { TerrainMeshManager } from './terrain-mesh-manager.js';

/** 32x8x8 grid of 8-cell chunks (4 in a row) with a solid block in every chunk. */
function makeGrid(): SdfGrid {
  const g = new SdfGrid(32, 8, 8, 1, 1, 8);
  for (let c = 0; c < 4; c++)
    for (let z = 2; z < 6; z++)
      for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) g.set(c * 8 + x, y, z, -1);
  g.takeDirtyChunks();
  return g;
}

function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return { now: () => t, advance: (ms) => void (t += ms) };
}

/** Manager over a manual transport; each dispatch costs `costMs` on the fake clock. */
function setup(budgetMs: number, costMs: number) {
  const clock = fakeClock();
  const sent: MeshRequest[] = [];
  let cb: ((r: MeshResponse) => void) | null = null;
  const transport: MeshTransport = {
    post: (m) => {
      sent.push(m);
      clock.advance(costMs);
    },
    onMessage: (c) => {
      cb = c;
    },
    terminate: () => undefined,
  };
  const mgr = new TerrainMeshManager({
    grid: makeGrid(),
    transport,
    budgetMs,
    now: clock.now,
    maxInFlight: 100,
    initialMaxInFlight: 100,
    initialBudgetMs: budgetMs,
  });
  const replyAll = (): void => {
    for (const r of sent.splice(0)) cb?.(handleMeshRequest(r));
  };
  return { clock, sent, mgr, replyAll };
}

describe('RebuildScheduler', () => {
  it('always allows the first item and then stops at the budget', () => {
    const clock = fakeClock();
    const s = new RebuildScheduler(8, clock.now);
    s.beginFrame();
    clock.advance(20);
    expect(s.canStart()).toBe(true);
    s.record('apply');
    expect(s.canStart()).toBe(false);
    s.endFrame(3);
    expect(s.stats).toMatchObject({ stalls: 1, lastApplied: 1, backlog: 3, lastFrameMs: 20 });
  });
});

describe('TerrainMeshManager budget', () => {
  it('stops dispatching when the budget is spent and carries over', () => {
    const { mgr, sent } = setup(8, 3);
    mgr.markAllDirty();
    mgr.update();
    expect(sent).toHaveLength(3); // starts at 0, 3, 6 ms; at 9 ms the budget is spent
    expect(mgr.stats).toMatchObject({ lastDispatched: 3, backlog: 1, stalls: 1 });
    mgr.update();
    expect(sent).toHaveLength(4);
    expect(mgr.stats).toMatchObject({ backlog: 0, totalDispatched: 4, frames: 2 });
    mgr.dispose();
  });

  it('makes progress even when one item exceeds the budget', () => {
    const { mgr, sent } = setup(1, 50);
    mgr.markAllDirty();
    mgr.update();
    expect(sent).toHaveLength(1);
    mgr.update();
    expect(sent).toHaveLength(2);
    expect(mgr.stats.stalls).toBe(2);
    mgr.dispose();
  });

  it('applies finished meshes nearest-to-focus first, one per frame at zero budget', () => {
    const t = setup(0, 0);
    t.mgr.setFocus(new THREE.Vector3(28, 4, 4));
    t.mgr.markAllDirty();
    for (let i = 0; i < 4; i++) t.mgr.update();
    t.replyAll();
    t.mgr.update();
    expect(t.mgr.getMesh(3)).toBeDefined();
    expect(t.mgr.meshCount).toBe(1);
    expect(t.mgr.stats).toMatchObject({ lastApplied: 1, backlog: 3 });
    t.mgr.update();
    expect(t.mgr.getMesh(2)).toBeDefined();
    expect(t.mgr.meshCount).toBe(2);
    t.mgr.dispose();
  });

  it('counts applied meshes and reports an empty backlog when done', () => {
    const t = setup(8, 0);
    t.mgr.markAllDirty();
    t.mgr.update();
    t.replyAll();
    t.mgr.update();
    expect(t.mgr.stats).toMatchObject({ totalApplied: 4, backlog: 0, stalls: 0 });
    expect(t.mgr.idle).toBe(true);
    t.mgr.dispose();
  });
});
