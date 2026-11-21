import * as THREE from 'three';
import { qualitySettings, type QualityTier } from './quality.js';
import { SnailMesh } from './snail-mesh.js';

/** Options for createGameView. */
export interface GameViewOptions {
  tier: QualityTier;
}

/** Handle to a running game view. */
export interface GameView {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** Creates renderer, scene, camera and lights on a canvas and starts the render loop. */
export function createGameView(canvas: HTMLCanvasElement, opts: GameViewOptions): GameView {
  const q = qualitySettings(opts.tier, window.devicePixelRatio);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias });
  renderer.setPixelRatio(q.pixelRatio);
  renderer.shadowMap.enabled = q.shadows;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(0, 4, 10);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445522, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(5, 10, 5);
  sun.castShadow = q.shadows;
  scene.add(sun);
  scene.add(new SnailMesh().group);

  const resize = (w: number, h: number): void => {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  renderer.setAnimationLoop(() => renderer.render(scene, camera));
  resize(canvas.clientWidth || 1, canvas.clientHeight || 1);

  return { scene, camera, resize, dispose: () => renderer.dispose() };
}
