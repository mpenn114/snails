import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CachedModelLoader, partsFromBuffer, type ModelPart } from './model-loader.js';

const box = (): ModelPart => ({
  geometry: new THREE.BoxGeometry(1, 1, 1),
  material: new THREE.MeshBasicMaterial(),
});

describe('CachedModelLoader', () => {
  it('loads each URL once, even for concurrent calls', async () => {
    const fetchParts = vi.fn(async () => [box()]);
    const loader = new CachedModelLoader(fetchParts);
    const [a, b] = await Promise.all([loader.load('/m/a.glb'), loader.load('/m/a.glb')]);
    await loader.load('/m/b.glb');
    expect(a).toBe(b);
    expect(fetchParts).toHaveBeenCalledTimes(2);
    expect(loader.size).toBe(2);
  });

  it('evicts failed loads so a later call retries', async () => {
    const fetchParts = vi
      .fn<(url: string) => Promise<ModelPart[]>>()
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValue([box()]);
    const loader = new CachedModelLoader(fetchParts);
    await expect(loader.load('/m/x.glb')).rejects.toThrow('404');
    await expect(loader.load('/m/x.glb')).resolves.toBeDefined();
    expect(fetchParts).toHaveBeenCalledTimes(2);
  });

  it('instantiates meshes that share geometry and frees it on dispose', async () => {
    const loader = new CachedModelLoader(async () => [box(), box()]);
    const asset = await loader.load('/m/a.glb');
    const one = loader.instantiate(asset);
    const two = loader.instantiate(asset);
    expect(one).not.toBe(two);
    expect(one.children).toHaveLength(2);
    expect((one.children[0] as THREE.Mesh).geometry).toBe(asset.parts[0]?.geometry);
    const spy = vi.spyOn(asset.parts[0]?.geometry as THREE.BufferGeometry, 'dispose');
    loader.dispose();
    expect(spy).toHaveBeenCalled();
    expect(loader.size).toBe(0);
  });
});

describe('committed models', () => {
  const dir = new URL('../../../content-base/assets/models/', import.meta.url);
  const read = (name: string): ArrayBuffer => {
    const b = readFileSync(new URL(name, dir));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };

  it('parses a glb into world-baked toon parts sitting on the origin', async () => {
    const parts = await partsFromBuffer(read('mushroom-a.glb'), 'high');
    expect(parts.length).toBeGreaterThan(0);
    const bb = new THREE.Box3();
    for (const p of parts) {
      p.geometry.computeBoundingBox();
      bb.union(p.geometry.boundingBox as THREE.Box3);
      expect(p.material).toBeInstanceOf(THREE.MeshToonMaterial);
      expect(Object.keys(p.geometry.attributes).sort()).toEqual(['normal', 'position']);
    }
    expect(bb.min.y).toBeCloseTo(0, 2);
    expect(bb.max.y).toBeCloseTo(0.7, 2);
  });
});
