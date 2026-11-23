import * as THREE from 'three';

/** Named root groups that feature modules attach their objects to. */
export interface SceneRoots {
  /** Terrain chunk meshes. */
  terrain: THREE.Group;
  /** Snails and other entities. */
  entities: THREE.Group;
  /** Projectiles, explosions, particles. */
  effects: THREE.Group;
  /** Lights, sky, water, wind visuals. */
  environment: THREE.Group;
}

/** A scene with its named root groups. */
export interface SceneGraph {
  scene: THREE.Scene;
  roots: SceneRoots;
}

/** Creates an empty scene containing the four named root groups. */
export function createSceneGraph(): SceneGraph {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  const make = (name: string): THREE.Group => {
    const g = new THREE.Group();
    g.name = name;
    scene.add(g);
    return g;
  };
  const roots: SceneRoots = {
    terrain: make('terrain'),
    entities: make('entities'),
    effects: make('effects'),
    environment: make('environment'),
  };
  return { scene, roots };
}
