import * as THREE from 'three';
import {
  chunkCount,
  createChunkPool,
  stepChunks,
  type ChunkPhysics,
  type ChunkPool,
} from './chunk-pool.js';

/** Per-pool look: how size and colour evolve over normalised age. */
export interface ChunkStyle {
  /** Size multiplier over normalised age t in [0,1]. */
  scale: (t: number) => number;
  /** Optional dynamic colour (sRGB 0..1 into `out`); when absent the spawn colour is used. */
  colour?: (t: number, out: Float32Array) => void;
}

const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const tmpMat = new THREE.Matrix4();
const tmpColor = new THREE.Color();
const tmpRgb = new Float32Array(3);

/**
 * One InstancedMesh (one draw call) driven by a {@link ChunkPool}. Dead slots are collapsed to
 * zero scale. Owns the mesh and pool, not the geometry or material.
 */
export class InstancedChunks {
  /** The instanced mesh to add to the scene. */
  readonly mesh: THREE.InstancedMesh;
  /** Simulation data; emit into it with `emitChunk`. */
  readonly pool: ChunkPool;

  /** Creates the mesh with `capacity` instances. */
  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
    private readonly physics: ChunkPhysics,
    private readonly style: ChunkStyle,
  ) {
    this.pool = createChunkPool(capacity);
    this.mesh = new THREE.InstancedMesh(geometry, material, this.pool.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, tmpColor.set(0xffffff));
    this.mesh.frustumCulled = false;
    this.writeAll();
  }

  /** Number of live chunks. */
  get live(): number {
    return chunkCount(this.pool);
  }

  /** Steps the simulation and refreshes the GPU instance data. */
  advance(dt: number): void {
    stepChunks(this.pool, dt, this.physics);
    this.writeAll();
  }

  /** Removes the mesh from its parent (geometry and material are owned by the caller). */
  dispose(): void {
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }

  private writeAll(): void {
    const p = this.pool;
    for (let i = 0; i < p.capacity; i++) {
      const life = p.life[i] ?? 0;
      const k = i * 3;
      if (life <= 0) {
        tmpScale.set(0, 0, 0);
        tmpPos.set(0, 0, 0);
        tmpQuat.identity();
      } else {
        const t = (p.age[i] ?? 0) / life;
        const s = (p.size[i] ?? 0) * Math.max(0, this.style.scale(t));
        tmpScale.set(s, s, s);
        tmpPos.set(p.pos[k] ?? 0, p.pos[k + 1] ?? 0, p.pos[k + 2] ?? 0);
        tmpEuler.set(p.rot[k] ?? 0, p.rot[k + 1] ?? 0, p.rot[k + 2] ?? 0);
        tmpQuat.setFromEuler(tmpEuler);
        this.writeColour(i, t);
      }
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      this.mesh.setMatrixAt(i, tmpMat);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private writeColour(i: number, t: number): void {
    const p = this.pool;
    const k = i * 3;
    if (this.style.colour) this.style.colour(t, tmpRgb);
    else {
      tmpRgb[0] = p.colour[k] ?? 0;
      tmpRgb[1] = p.colour[k + 1] ?? 0;
      tmpRgb[2] = p.colour[k + 2] ?? 0;
    }
    tmpColor.setRGB(tmpRgb[0] ?? 0, tmpRgb[1] ?? 0, tmpRgb[2] ?? 0, THREE.SRGBColorSpace);
    this.mesh.setColorAt(i, tmpColor);
  }
}
