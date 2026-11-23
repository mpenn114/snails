import { PALETTE } from '../style/palette.js';
import * as THREE from 'three';
import { tierProfile, type QualityTier } from '../quality.js';

/** Water options. */
export interface WaterOptions {
  tier: QualityTier;
  /** World Y of the surface. */
  level: number;
  /** Terrain bounds the plane must extend beyond. */
  bounds: { min: THREE.Vector3; max: THREE.Vector3 };
  /** Extra margin (m) beyond bounds on each side. */
  margin?: number;
}

/** Water surface handle. */
export interface Water {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** Advances the animation clock by `dt` seconds. */
  update(dt: number): void;
  /** Current animation time (s). */
  readonly time: number;
  dispose(): void;
}

const VERT = /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform float uOpacity;
#include <fog_pars_fragment>
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz;
  #ifdef RIPPLES
  vec2 g = vec2(
    cos(p.x * 0.9 + uTime * 1.1) + cos(p.x * 0.5 + p.y * 0.7 - uTime * 0.8),
    cos(p.y * 1.1 - uTime * 0.9) + cos(p.y * 0.6 - p.x * 0.4 + uTime * 0.7));
  vec3 n = normalize(vec3(g.x * 0.08, 1.0, g.y * 0.08));
  #else
  vec3 n = vec3(0.0, 1.0, 0.0);
  #endif
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float dist = clamp(length(cameraPosition - vWorld) / 80.0, 0.0, 1.0);
  vec3 col = mix(uShallow, uDeep, dist);
  col = mix(col, vec3(0.75, 0.88, 1.0), fres * 0.6);
  gl_FragColor = vec4(col, mix(uOpacity, 1.0, fres));
  #include <fog_fragment>
}`;

/** Creates a large animated water plane at `level` extending beyond the bounds. */
export function createWater(opts: WaterOptions): Water {
  const margin = opts.margin ?? 2000;
  const profile = tierProfile(opts.tier);
  const size = opts.bounds.max.clone().sub(opts.bounds.min);
  const centre = opts.bounds.min.clone().add(opts.bounds.max).multiplyScalar(0.5);
  const geometry = new THREE.PlaneGeometry(size.x + margin * 2, size.z + margin * 2);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
    defines: profile.waterQuality === 'ripples' ? { RIPPLES: '' } : {},
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib['fog']),
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(PALETTE.waterShallow) },
      uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
      uOpacity: { value: Math.max(0.94, profile.waterOpacity) },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'water';
  mesh.position.set(centre.x, opts.level, centre.z);
  mesh.renderOrder = 1;
  let time = 0;
  return {
    mesh,
    material,
    update(dt) {
      time += dt;
      (material.uniforms['uTime'] as THREE.IUniform<number>).value = time;
    },
    get time() {
      return time;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
