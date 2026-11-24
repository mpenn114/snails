import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getToonMaterial } from '../style/materials.js';
import type { QualityTier } from '../quality.js';

/** One drawable piece of a loaded model: world-baked geometry and its (shared) material. */
export interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** A loaded model, shared by every instance. Owned (and disposed) by its {@link ModelLoader}. */
export interface ModelAsset {
  readonly url: string;
  readonly parts: readonly ModelPart[];
}

/** Loads models once per URL and hands out cheap instances. */
export interface ModelLoader {
  /** Resolves with the cached asset (one network load per URL, even for concurrent calls). */
  load(url: string): Promise<ModelAsset>;
  /** A fresh group of meshes sharing the asset's geometry and materials. */
  instantiate(asset: ModelAsset): THREE.Group;
  /** Frees every cached geometry; assets must not be used afterwards. */
  dispose(): void;
}

/** Fetches and converts one URL; the injection point that tests replace. */
export type PartsFetcher = (url: string) => Promise<ModelPart[]>;

/**
 * Cache wrapper around a {@link PartsFetcher}: one load per URL (failed loads are evicted so a
 * later call can retry), clone-per-instance via shared geometry, dispose on teardown.
 */
export class CachedModelLoader implements ModelLoader {
  private readonly cache = new Map<string, Promise<ModelAsset>>();
  private readonly loaded: ModelAsset[] = [];
  private disposed = false;

  /** Wraps `fetchParts`. */
  constructor(private readonly fetchParts: PartsFetcher) {}

  /** See {@link ModelLoader.load}. */
  load(url: string): Promise<ModelAsset> {
    const hit = this.cache.get(url);
    if (hit) return hit;
    const p = this.fetchParts(url).then((parts) => {
      const asset: ModelAsset = { url, parts };
      if (this.disposed) disposeAsset(asset);
      else this.loaded.push(asset);
      return asset;
    });
    p.catch(() => this.cache.delete(url));
    this.cache.set(url, p);
    return p;
  }

  /** See {@link ModelLoader.instantiate}. */
  instantiate(asset: ModelAsset): THREE.Group {
    const group = new THREE.Group();
    group.name = asset.url;
    for (const part of asset.parts) group.add(new THREE.Mesh(part.geometry, part.material));
    return group;
  }

  /** Number of assets currently held (for tests and diagnostics). */
  get size(): number {
    return this.loaded.length;
  }

  /** See {@link ModelLoader.dispose}. */
  dispose(): void {
    this.disposed = true;
    for (const a of this.loaded) disposeAsset(a);
    this.loaded.length = 0;
    this.cache.clear();
  }
}

function disposeAsset(asset: ModelAsset): void {
  for (const part of asset.parts) part.geometry.dispose();
}

/**
 * Converts a parsed glTF scene into toon parts: node transforms are baked into cloned geometry,
 * unused attributes dropped, and every material replaced by the shared flat-shaded toon material
 * of the same base colour (the source colours are already palette-recoloured).
 */
export function partsFromScene(scene: THREE.Object3D, tier: QualityTier): ModelPart[] {
  scene.updateMatrixWorld(true);
  const parts: ModelPart[] = [];
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const colour = (src as THREE.MeshStandardMaterial | undefined)?.color;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    }
    geometry.computeBoundingSphere();
    parts.push({
      geometry,
      material: getToonMaterial({ color: colour?.getHex() ?? 0xffffff, flat: true, tier }),
    });
  });
  return parts;
}

/** Parses a .glb/.gltf buffer into toon parts (no network, no DOM: used by tests and loaders). */
export async function partsFromBuffer(
  buffer: ArrayBuffer,
  tier: QualityTier,
): Promise<ModelPart[]> {
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  const parts = partsFromScene(gltf.scene, tier);
  disposeScene(gltf.scene);
  return parts;
}

function disposeScene(scene: THREE.Object3D): void {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m.dispose();
  });
}

/** Creates the real loader: `fetch` plus GLTFLoader, cached per URL. */
export function createGltfModelLoader(tier: QualityTier = 'high'): CachedModelLoader {
  return new CachedModelLoader(async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`model ${url}: HTTP ${res.status}`);
    return partsFromBuffer(await res.arrayBuffer(), tier);
  });
}
