import * as THREE from 'three';
import type { QualityTier } from '../quality.js';
import { LIGHTING, PALETTE } from '../style/palette.js';

/** Radius of the sky dome (m); must stay inside the smallest camera far plane. */
export const SKY_RADIUS = 200;

/** Cloud drift speed in radians per second around the vertical axis. */
export const CLOUD_DRIFT_RAD_PER_S = 0.006;

/** Unit vector from the scene towards the sun (azimuth clockwise from +Z towards +X). */
export function sunDirectionFromAngles(elevationDeg: number, azimuthDeg: number): THREE.Vector3 {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
}

/** The art-direction sun direction (LIGHTING elevation/azimuth). */
export function defaultSunDirection(): THREE.Vector3 {
  return sunDirectionFromAngles(LIGHTING.sunElevationDeg, LIGHTING.sunAzimuthDeg);
}

/** Sky configuration derived from the quality tier. */
export interface SkyConfig {
  /** Number of drifting clouds (0 = none). */
  clouds: number;
}

/** Clouds are High tier only; every other tier gets the plain gradient. */
export function skyConfig(tier: QualityTier): SkyConfig {
  return { clouds: tier === 'high' ? 12 : 0 };
}

/** Options for the sky builder. */
export interface SkyOptions {
  tier: QualityTier;
  /** Direction towards the sun (defaults to the art-direction sun). */
  sunDirection?: THREE.Vector3;
}

/** A sky dome that follows the camera. */
export interface Sky {
  group: THREE.Group;
  dome: THREE.Mesh;
  /** Cloud meshes (empty off the High tier). */
  clouds: THREE.Mesh[];
  /** Drifts clouds; a fixed dt (shot mode) keeps captures deterministic. */
  update(dt: number): void;
  dispose(): void;
}

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, smoothstep(0.02, 0.3, h));
  col = mix(uHaze, col, smoothstep(0.0, 0.08, h));
  float s = max(dot(d, uSunDir), 0.0);
  col = mix(col, uSunColor, pow(s, 6.0) * 0.35 + pow(s, 48.0) * 0.45);
  col = mix(col, uSunColor, smoothstep(0.995, 0.999, s) * 0.8);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function placeCloud(cloud: THREE.Mesh, dt: number): void {
  const az = (cloud.userData['azimuth'] as number) + dt * CLOUD_DRIFT_RAD_PER_S;
  const el = cloud.userData['elevation'] as number;
  cloud.userData['azimuth'] = az;
  const r = SKY_RADIUS * 0.8;
  cloud.position.set(
    Math.sin(az) * Math.cos(el) * r,
    Math.sin(el) * r,
    Math.cos(az) * Math.cos(el) * r,
  );
  cloud.rotation.y = az;
}

interface CloudSet {
  meshes: THREE.Mesh[];
  dispose(): void;
}

function createClouds(count: number): CloudSet {
  const meshes: THREE.Mesh[] = [];
  const cloudGeo = new THREE.IcosahedronGeometry(1, 0);
  const cloudMat = new THREE.MeshBasicMaterial({
    color: PALETTE.uiPaper,
    transparent: true,
    opacity: 0.85,
    fog: false,
    depthWrite: false,
  });
  for (let i = 0; i < count; i++) {
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    cloud.name = 'sky-cloud';
    cloud.userData['azimuth'] = (i / count) * Math.PI * 2 + (i % 2) * 0.3;
    cloud.userData['elevation'] = 0.14 + (((i * 37) % 11) / 11) * 0.3;
    cloud.scale.set(14 + (i % 3) * 5, 3.5 + (i % 2), 8 + (i % 4) * 2);
    placeCloud(cloud, 0);
    meshes.push(cloud);
  }
  return {
    meshes,
    dispose() {
      cloudGeo.dispose();
      cloudMat.dispose();
    },
  };
}

/** Builds the gradient sky dome (plus soft low-poly clouds on High). Unaffected by fog. */
export function createSky(opts: SkyOptions): Sky {
  const sun = (opts.sunDirection ?? defaultSunDirection()).clone().normalize();
  const group = new THREE.Group();
  group.name = 'sky';
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(PALETTE.skyTop) },
      uHaze: { value: new THREE.Color(LIGHTING.fogColor) },
      uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      uSunColor: { value: new THREE.Color(LIGHTING.sunColor) },
      uSunDir: { value: sun },
    },
  });
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 24, 16);
  const dome = new THREE.Mesh(geometry, material);
  dome.name = 'sky-dome';
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  group.add(dome);
  // Follow the camera so the sky never parallaxes.
  group.onBeforeRender = (_r, _s, camera) => group.position.copy(camera.position);
  dome.onBeforeRender = (_r, _s, camera) => group.position.copy(camera.position);

  const cloudSet = createClouds(skyConfig(opts.tier).clouds);
  const clouds = cloudSet.meshes;
  for (const c of clouds) group.add(c);
  return {
    group,
    dome,
    clouds,
    update(dt) {
      for (const c of clouds) placeCloud(c, dt);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      cloudSet.dispose();
    },
  };
}
