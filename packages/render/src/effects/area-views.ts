import * as THREE from 'three';
import type { AreaInstance } from '@snails/core';
import { PALETTE } from '../style/palette.js';

/** Goo green: a bright slime, kept clear of the grass tones. */
const GOO_COLOUR = 0x9bdc3c;
const GOO_RIM_COLOUR = 0x5fae2a;
/** Spore cloud: pale lilac puffs with a warm yellow core, kept clear of terrain and team hues. */
const SPORE_COLOUR = 0xd4b8ee;
const SPORE_CORE_COLOUR = 0xf0e0a0;
/** Puff centres in the unit sphere (fixed layout, so views are deterministic). */
const SPORE_PUFFS: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0.55],
  [0.5, 0.2, 0.1, 0.4],
  [-0.5, 0.1, -0.15, 0.42],
  [0.15, 0.5, 0.2, 0.36],
  [-0.2, -0.35, 0.3, 0.38],
  [0.35, -0.3, -0.3, 0.34],
  [-0.1, 0.3, -0.45, 0.32],
];
/** Seconds-scale bob so a dome reads as alive without per-kind art. */
const PULSE_RATE = 1.6;
/** Puddle disc lift above the water surface (stops z-fighting with terrain-hugging ground). */
const PUDDLE_LIFT = 0.02;

/** One area's visual: a scene object plus a pure function of the snapshot area and a clock. */
export interface AreaView {
  readonly object: THREE.Object3D;
  /** Places and scales the view from `area`; `clock` is seconds for idle animation. */
  update(area: AreaInstance, clock: number): void;
}

/** Builds a view for one area; the factory shares geometry and materials via {@link AreaAssets}. */
export type AreaViewFactory = (assets: AreaAssets) => AreaView;

/** Shared low-poly geometry and materials for all area views (a handful of draw-call kinds). */
export class AreaAssets {
  readonly dome = new THREE.IcosahedronGeometry(1, 1);
  readonly disc = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  readonly ring = new THREE.RingGeometry(0.9, 1, 20).rotateX(-Math.PI / 2);
  /** Low-poly blob for goo: a squashed icosphere. */
  readonly blob = new THREE.IcosahedronGeometry(1, 1);
  readonly domeMat = new THREE.MeshBasicMaterial({
    color: PALETTE.waterFoam,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  readonly waterMat = new THREE.MeshBasicMaterial({
    color: PALETTE.waterShallow,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  readonly foamMat = new THREE.MeshBasicMaterial({
    color: PALETTE.waterFoam,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  readonly sporeMat = new THREE.MeshBasicMaterial({
    color: SPORE_COLOUR,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  readonly sporeCoreMat = new THREE.MeshBasicMaterial({
    color: SPORE_CORE_COLOUR,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  readonly gooMat = new THREE.MeshLambertMaterial({ color: GOO_COLOUR });
  readonly gooRimMat = new THREE.MeshLambertMaterial({ color: GOO_RIM_COLOUR });

  /** Frees every shared GPU resource. */
  dispose(): void {
    for (const g of [this.dome, this.disc, this.ring, this.blob]) g.dispose();
    for (const m of [
      this.domeMat,
      this.waterMat,
      this.foamMat,
      this.gooMat,
      this.gooRimMat,
      this.sporeMat,
      this.sporeCoreMat,
    ]) {
      m.dispose();
    }
  }
}

/** Fallback: the translucent dome. */
const domeView: AreaViewFactory = (assets) => {
  const mesh = new THREE.Mesh(assets.dome, assets.domeMat);
  return {
    object: mesh,
    update(a, clock) {
      mesh.position.set(a.position.x, a.position.y, a.position.z);
      mesh.scale.setScalar(Math.max(0.1, a.radius) * (1 + 0.03 * Math.sin(clock * PULSE_RATE)));
    },
  };
};

/**
 * Puddle: a flat water-coloured disc at the surface height (`position.y`, where the sim put
 * the water) with a foam rim that laps slightly. Two meshes, no shader: cheap on `mobile`.
 */
const puddleView: AreaViewFactory = (assets) => {
  const group = new THREE.Group();
  const water = new THREE.Mesh(assets.disc, assets.waterMat);
  const rim = new THREE.Mesh(assets.ring, assets.foamMat);
  group.add(water, rim);
  return {
    object: group,
    update(a, clock) {
      group.position.set(a.position.x, a.position.y + PUDDLE_LIFT, a.position.z);
      const r = Math.max(0.1, a.radius);
      water.scale.set(r, 1, r);
      rim.scale.setScalar(r * (1 + 0.02 * Math.sin(clock * PULSE_RATE)));
    },
  };
};

/** Goo splat: a flat green blob with a darker lumpy rim, sitting on the ground it landed on. */
const gooView: AreaViewFactory = (assets) => {
  const group = new THREE.Group();
  const body = new THREE.Mesh(assets.blob, assets.gooMat);
  const rim = new THREE.Mesh(assets.blob, assets.gooRimMat);
  rim.rotation.y = 0.6;
  group.add(rim, body);
  return {
    object: group,
    update(a) {
      group.position.set(a.position.x, a.position.y, a.position.z);
      const r = Math.max(0.1, a.radius);
      body.scale.set(r * 0.8, 0.12, r * 0.8);
      rim.scale.set(r, 0.07, r);
    },
  };
};

/**
 * Spore cloud: seven soft translucent puffs (a lilac shell around a warm core) that drift in
 * slow orbits inside the cloud's radius. Shares one icosphere, two materials; 7 small meshes.
 */
const sporeView: AreaViewFactory = (assets) => {
  const group = new THREE.Group();
  const puffs = SPORE_PUFFS.map((_, i) => {
    const mesh = new THREE.Mesh(assets.dome, i % 3 === 0 ? assets.sporeCoreMat : assets.sporeMat);
    group.add(mesh);
    return mesh;
  });
  return {
    object: group,
    update(a, clock) {
      group.position.set(a.position.x, a.position.y, a.position.z);
      const r = Math.max(0.1, a.radius);
      puffs.forEach((mesh, i) => {
        const [x, y, z, size] = SPORE_PUFFS[i] ?? [0, 0, 0, 0.3];
        const t = clock * 0.5 + i * 1.7;
        mesh.position.set(
          (x + 0.08 * Math.sin(t)) * r,
          (y + 0.08 * Math.cos(t * 1.3)) * r,
          (z + 0.08 * Math.sin(t * 0.8)) * r,
        );
        mesh.scale.setScalar(size * r * (1 + 0.06 * Math.sin(t * 1.9)));
      });
    },
  };
};

/** View factories by area kind id; add a line to give a new area kind its own look. */
export const areaViewFactories: Readonly<Record<string, AreaViewFactory>> = {
  'base:puddle': puddleView,
  'base:goo-splat': gooView,
  'base:spore-cloud': sporeView,
};

/** The view for `kind`: its registered factory, or the translucent dome. */
export function createAreaView(kind: string, assets: AreaAssets): AreaView {
  return (areaViewFactories[kind] ?? domeView)(assets);
}
