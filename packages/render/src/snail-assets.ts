import * as THREE from 'three';

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

/** Geometries and materials shared by every snail in a layer. */
export class SnailAssets {
  readonly body = new THREE.CapsuleGeometry(0.25, 0.8, 4, 12);
  readonly shell = new THREE.SphereGeometry(0.5, 16, 12);
  readonly stalk = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6);
  readonly eye = new THREE.SphereGeometry(0.06, 8, 6);
  readonly ring = new THREE.RingGeometry(0.7, 0.85, 24);
  readonly grave = new THREE.BoxGeometry(0.4, 0.6, 0.15);
  /** Quad anchored at its left edge (scale.x = fraction). */
  readonly barFill = new THREE.PlaneGeometry(BAR_WIDTH, 0.12).translate(BAR_WIDTH / 2, 0, 0);
  readonly barBack = new THREE.PlaneGeometry(BAR_WIDTH + 0.06, 0.18).translate(
    BAR_WIDTH / 2,
    0,
    -0.001,
  );
  readonly bodyMat = new THREE.MeshStandardMaterial({ color: 0xb8c9a0 });
  readonly eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  readonly ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
  });
  readonly graveMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
  readonly barBackMat = new THREE.MeshBasicMaterial({ color: 0x111111, depthTest: false });
  readonly barFillMat = new THREE.MeshBasicMaterial({ color: 0x44dd55, depthTest: false });

  /** Frees all shared GPU resources. */
  dispose(): void {
    const geos = [this.body, this.shell, this.stalk, this.eye, this.ring, this.grave];
    for (const g of [...geos, this.barFill, this.barBack]) g.dispose();
    const mats = [this.bodyMat, this.eyeMat, this.ringMat, this.graveMat];
    for (const m of [...mats, this.barBackMat, this.barFillMat]) m.dispose();
  }
}
