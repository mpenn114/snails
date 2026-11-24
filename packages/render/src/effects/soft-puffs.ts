import * as THREE from 'three';
import {
  chunkCount,
  createChunkPool,
  stepChunks,
  type ChunkPhysics,
  type ChunkPool,
} from './chunk-pool.js';
import type { ChunkStyle } from './instanced-chunks.js';

const VERT = /* glsl */ `
attribute vec3 aOffset;
attribute float aSize;
attribute float aAlpha;
attribute float aSeed;
attribute vec3 aColour;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
varying vec3 vColour;
void main() {
  vUv = position.xy * 2.0;
  vAlpha = aAlpha;
  vSeed = aSeed;
  vColour = aColour;
  vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
  mv.xy += position.xy * 2.0 * aSize;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
varying vec3 vColour;
void main() {
  float d = length(vUv);
  float ang = atan(vUv.y, vUv.x);
  // Wobbly rim so no two puffs share a silhouette; the falloff is smooth, never a hard edge.
  float wob = 1.0 + 0.07 * sin(ang * 2.0 + vSeed * 6.283) + 0.04 * sin(ang * 3.0 + vSeed * 17.0);
  float a = smoothstep(1.0, 0.0, d * wob);
  a *= a * vAlpha;
  if (a < 0.004) discard;
  // Faint light-from-above shading so a puff reads as a soft volume, not a flat disc.
  vec3 col = vColour * (0.88 + 0.16 * clamp(vUv.y * 0.5 + 0.5, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

const tmpColor = new THREE.Color();
const rgb = new Float32Array(3);

/**
 * Camera-facing soft smoke sprites in ONE draw call (instanced quads with a procedural, smooth
 * alpha falloff, no texture). Driven by a {@link ChunkPool}, so it shares the emit/step API of
 * the solid chunk pools. Owns its mesh, geometry and material.
 */
export class SoftPuffs {
  /** The mesh to add to the scene. */
  readonly mesh: THREE.Mesh;
  /** Simulation data; emit into it with `emitChunk`. */
  readonly pool: ChunkPool;
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly offset: THREE.InstancedBufferAttribute;
  private readonly size: THREE.InstancedBufferAttribute;
  private readonly alpha: THREE.InstancedBufferAttribute;
  private readonly colour: THREE.InstancedBufferAttribute;

  /** Creates the sprite set with `capacity` slots. */
  constructor(
    capacity: number,
    private readonly physics: ChunkPhysics,
    private readonly style: ChunkStyle,
  ) {
    this.pool = createChunkPool(capacity);
    const n = this.pool.capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    const dyn = (items: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(n * items), items);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.offset = dyn(3);
    this.size = dyn(1);
    this.alpha = dyn(1);
    this.colour = dyn(3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) seed[i] = (i * 0.618034) % 1;
    this.geometry.setAttribute('aOffset', this.offset);
    this.geometry.setAttribute('aSize', this.size);
    this.geometry.setAttribute('aAlpha', this.alpha);
    this.geometry.setAttribute('aColour', this.colour);
    this.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    this.geometry.instanceCount = n;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.write();
  }

  /** Number of live puffs. */
  get live(): number {
    return chunkCount(this.pool);
  }

  /** Steps the simulation and refreshes the GPU data. */
  advance(dt: number): void {
    stepChunks(this.pool, dt, this.physics);
    this.write();
  }

  /** Frees GPU resources and detaches the mesh. */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }

  private write(): void {
    const p = this.pool;
    for (let i = 0; i < p.capacity; i++) {
      const life = p.life[i] ?? 0;
      const k = i * 3;
      if (life <= 0) {
        this.size.setX(i, 0);
        this.alpha.setX(i, 0);
        continue;
      }
      const t = (p.age[i] ?? 0) / life;
      this.offset.setXYZ(i, p.pos[k] ?? 0, p.pos[k + 1] ?? 0, p.pos[k + 2] ?? 0);
      this.size.setX(i, (p.size[i] ?? 0) * Math.max(0, this.style.scale(t)));
      this.alpha.setX(i, this.style.alpha?.(t) ?? 1);
      if (this.style.colour) this.style.colour(t, rgb);
      else {
        rgb[0] = p.colour[k] ?? 1;
        rgb[1] = p.colour[k + 1] ?? 1;
        rgb[2] = p.colour[k + 2] ?? 1;
      }
      tmpColor.setRGB(rgb[0] ?? 1, rgb[1] ?? 1, rgb[2] ?? 1, THREE.SRGBColorSpace);
      this.colour.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
    }
    for (const a of [this.offset, this.size, this.alpha, this.colour]) a.needsUpdate = true;
  }
}
