import { SdfGrid, type GameSnapshot } from '@snails/core';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { RenderState } from '../render-loop.js';
import { CachedModelLoader } from './model-loader.js';
import { PropLayer, type PropLayerOptions } from './prop-layer.js';
import type { PropKind } from './prop-plan.js';

const kinds: PropKind[] = [
  { file: 'a.glb', weight: 1, scale: [1, 1], tint: 0.1, lean: 0.5, castShadow: true },
  { file: 'b.glb', weight: 1, scale: [1, 1], tint: 0, lean: 0.5, castShadow: false },
];

function flatGrid(): SdfGrid {
  const g = new SdfGrid(61, 24, 61, 0.5, 1);
  for (let z = 0; z < g.nz; z++)
    for (let y = 0; y < g.ny; y++) for (let x = 0; x < g.nx; x++) g.set(x, y, z, y * 0.5 - 4);
  return g;
}

const state = { snapshot: { teams: [] } as unknown as GameSnapshot, alpha: 0 } as RenderState;

function makeLayer(over: Partial<PropLayerOptions> = {}) {
  const requested: string[] = [];
  const loader = new CachedModelLoader(async (url) => {
    requested.push(url);
    if (url.endsWith('b.glb')) throw new Error('missing');
    return [
      { geometry: new THREE.BoxGeometry(0.2, 0.2, 0.2), material: new THREE.MeshBasicMaterial() },
    ];
  });
  const grid = flatGrid();
  const layer = new PropLayer({
    grid,
    waterLevel: 1,
    count: 40,
    baseUrl: '/models/',
    loader,
    kinds,
    ...over,
  });
  return { layer, loader, grid, requested };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('PropLayer', () => {
  it('loads asynchronously and builds once the first snapshot arrives', async () => {
    const { layer, requested } = makeLayer();
    expect(layer.settled).toBe(false);
    layer.updater(0.016, null);
    expect(layer.count).toBe(0);
    await flush();
    expect(requested).toEqual(['/models/a.glb', '/models/b.glb']);
    layer.updater(0.016, null);
    expect(layer.settled).toBe(false);
    layer.updater(0.016, state);
    expect(layer.settled).toBe(true);
    // kind b failed to load: only kind a is drawn.
    expect(layer.count).toBeGreaterThan(5);
    expect(layer.group.children).toHaveLength(1);
    const mesh = layer.group.children[0] as THREE.InstancedMesh;
    expect(mesh.count).toBe(layer.count);
    expect(mesh.castShadow).toBe(false);
    layer.setShadows(true);
    expect(mesh.castShadow).toBe(true);
    layer.dispose();
    expect(layer.group.children).toHaveLength(0);
  });

  it('removes props whose ground is carved away', async () => {
    const { layer, grid } = makeLayer();
    await flush();
    layer.build();
    const before = layer.count;
    grid.carveSphere({ x: 15, y: 4, z: 15 }, 6);
    layer.pruneNow();
    expect(layer.count).toBeLessThan(before);
    expect((layer.group.children[0] as THREE.InstancedMesh).count).toBe(layer.count);
    layer.dispose();
  });

  it('prunes on the frame cadence', async () => {
    const { layer, grid } = makeLayer();
    await flush();
    layer.build();
    const before = layer.count;
    grid.carveSphere({ x: 15, y: 4, z: 15 }, 6);
    for (let i = 0; i < 4; i++) layer.updater(0.016, state);
    expect(layer.count).toBeLessThan(before);
  });

  it('is settled and empty when disabled or when every load fails', async () => {
    expect(makeLayer({ count: 0 }).layer.settled).toBe(true);
    const failing = new CachedModelLoader(async () => {
      throw new Error('offline');
    });
    const { layer } = makeLayer({ loader: failing });
    await flush();
    expect(layer.settled).toBe(true);
    expect(layer.count).toBe(0);
  });
});
