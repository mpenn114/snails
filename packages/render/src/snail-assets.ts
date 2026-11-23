import { createToonMaterial } from './style/materials.js';
import { PALETTE } from './style/palette.js';
import { buildShellGeometry, shellParamsFromSeed, type ShellLod } from './snail/shell-geometry.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Creates a texture showing `text` (used for name tags). */
export type LabelTextureFactory = (text: string) => THREE.Texture;

/** Default factory: draws the text on a lazily created 2D canvas (browser only). */
export const canvasLabelFactory: LabelTextureFactory = (text) => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(text, 128, 32);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 128, 32);
  }
  return new THREE.CanvasTexture(canvas);
};

/** Width of the health bar in metres. */
export const BAR_WIDTH = 1.2;

/** Returns `geo` baked with `matrix` and a constant vertex colour (for merging). */
function bake(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, hex: number): THREE.BufferGeometry {
  const g = geo.clone().applyMatrix4(matrix);
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const colours = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colours, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

/** Merges the static snail body, both eye stalks and both eyes into one vertex-coloured mesh. */
function buildBody(): THREE.BufferGeometry {
  const body = new THREE.CapsuleGeometry(0.25, 0.8, 4, 12);
  const stalk = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6);
  const eye = new THREE.SphereGeometry(0.06, 8, 6);
  const parts = [bake(body, new THREE.Matrix4().makeRotationZ(Math.PI / 2), PALETTE.snailSkin)];
  for (const z of [-0.1, 0.1]) {
    parts.push(bake(stalk, new THREE.Matrix4().makeTranslation(0.5, 0.3, z), PALETTE.snailSkin));
    parts.push(bake(eye, new THREE.Matrix4().makeTranslation(0.5, 0.47, z), PALETTE.uiInk));
  }
  const merged = mergeGeometries(parts, false);
  for (const g of [body, stalk, eye, ...parts]) g.dispose();
  if (!merged) throw new Error('snail body merge failed');
  return merged;
}

/** Geometries and materials shared by every snail in a layer. */
export class SnailAssets {
  /** Body, stalks and eyes merged into one draw call (vertex colours). */
  readonly body = buildBody();
  readonly ring = new THREE.RingGeometry(0.7, 0.85, 24);
  readonly grave = new THREE.BoxGeometry(0.4, 0.6, 0.15);
  /** Quad anchored at its left edge (scale.x = fraction). */
  readonly barFill = new THREE.PlaneGeometry(BAR_WIDTH, 0.12).translate(BAR_WIDTH / 2, 0, 0);
  readonly barBack = new THREE.PlaneGeometry(BAR_WIDTH + 0.06, 0.18).translate(
    BAR_WIDTH / 2,
    0,
    -0.001,
  );
  readonly bodyMat = createToonMaterial({ color: 0xffffff, vertexColors: true, flat: true });
  readonly ringMat = new THREE.MeshBasicMaterial({
    color: PALETTE.uiPaper,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
  });
  readonly graveMat = createToonMaterial({ color: PALETTE.rock, flat: true });
  readonly barBackMat = new THREE.MeshBasicMaterial({
    color: PALETTE.uiInk,
    depthTest: false,
    transparent: true,
  });
  readonly barFillMat = new THREE.MeshBasicMaterial({
    color: PALETTE.grassTop,
    depthTest: false,
    transparent: true,
  });

  private readonly shells = new Map<number, THREE.BufferGeometry>();

  /** @param shellLod - Shell level of detail (0 = full, 1 = cheap mobile). */
  constructor(readonly shellLod: ShellLod = 0) {}

  /** Returns the shell geometry for `seed`, built once and cached (shared by equal seeds). */
  shellGeometry(seed: number): THREE.BufferGeometry {
    let g = this.shells.get(seed);
    if (!g) {
      g = buildShellGeometry(shellParamsFromSeed(seed), this.shellLod);
      this.shells.set(seed, g);
    }
    return g;
  }

  /** Frees all shared GPU resources. */
  dispose(): void {
    const geos = [this.body, this.ring, this.grave, ...this.shells.values()];
    for (const g of [...geos, this.barFill, this.barBack]) g.dispose();
    this.shells.clear();
    const mats = [this.bodyMat, this.ringMat, this.graveMat];
    for (const m of [...mats, this.barBackMat, this.barFillMat]) m.dispose();
  }
}
