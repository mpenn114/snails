import { createToonMaterial } from './style/materials.js';
import { PALETTE } from './style/palette.js';
import { buildSnailBody, type SnailBodyParts } from './snail/body-geometry.js';
import { buildShellGeometry, shellParamsFromSeed, type ShellLod } from './snail/shell-geometry.js';
import type { ShellMaterialKind } from './research/shell-look.js';
import { createShellMaterial, shellMaterialKey } from './snail/shell-material.js';
import type { QualityTier } from './quality.js';
import * as THREE from 'three';

/** Snail level of detail for a quality tier: full on high/medium, cheap on low/mobile. */
export function snailLodForTier(tier: QualityTier): ShellLod {
  return tier === 'high' || tier === 'medium' ? 0 : 1;
}

/** Options of {@link SnailAssets}. */
export interface SnailAssetsOptions {
  /** Quality tier; picks the level of detail and the toon variant (default high). */
  tier?: QualityTier;
  /** Overrides the level of detail derived from the tier. */
  lod?: ShellLod;
}

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
  /** Body, eye stalks and pupil geometry for this level of detail. */
  readonly parts: SnailBodyParts;
  /** Torso with tail and head (vertex colours). */
  readonly body: THREE.BufferGeometry;
  readonly ring = new THREE.RingGeometry(0.7, 0.85, 24);
  readonly grave = new THREE.BoxGeometry(0.4, 0.6, 0.15);
  /** Quad anchored at its left edge (scale.x = fraction). */
  readonly barFill = new THREE.PlaneGeometry(BAR_WIDTH, 0.12).translate(BAR_WIDTH / 2, 0, 0);
  readonly barBack = new THREE.PlaneGeometry(BAR_WIDTH + 0.06, 0.18).translate(
    BAR_WIDTH / 2,
    0,
    -0.001,
  );
  readonly bodyMat: THREE.MeshToonMaterial;
  /** Material of the eye stalks and eyeballs (vertex colours). */
  readonly eyeMat: THREE.MeshToonMaterial;
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
  private readonly shellMats = new Map<string, THREE.MeshToonMaterial>();
  /** Level of detail of the body and shell (0 = full, 1 = cheap mobile). */
  readonly shellLod: ShellLod;
  /** Quality tier the toon materials are built for. */
  readonly tier: QualityTier;

  /** @param opts - Quality tier / level of detail. */
  constructor(opts: SnailAssetsOptions = {}) {
    this.tier = opts.tier ?? 'high';
    this.shellLod = opts.lod ?? snailLodForTier(this.tier);
    this.parts = buildSnailBody(this.shellLod);
    this.body = this.parts.body;
    this.bodyMat = createToonMaterial({
      color: 0xffffff,
      vertexColors: true,
      rim: 0.35,
      tier: this.tier,
    });
    this.eyeMat = createToonMaterial({ color: 0xffffff, vertexColors: true, tier: this.tier });
  }

  /** Shared shell material for a team colour, pattern id and damage step (cached). */
  shellMaterial(
    colour: number,
    pattern: number,
    damageStep = 0,
    kind: ShellMaterialKind | null = null,
  ): THREE.MeshToonMaterial {
    const opts = { colour, pattern, damageStep, kind, tier: this.tier };
    const key = shellMaterialKey(opts);
    let m = this.shellMats.get(key);
    if (!m) {
      m = createShellMaterial(opts);
      this.shellMats.set(key, m);
    }
    return m;
  }

  /** Number of distinct shell materials created so far. */
  get shellMaterialCount(): number {
    return this.shellMats.size;
  }

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
    const geos = [
      this.body,
      this.ring,
      this.grave,
      ...this.parts.stalks,
      this.parts.pupil,
      this.parts.lid,
    ];
    for (const g of [...geos, ...this.shells.values(), this.barFill, this.barBack]) g.dispose();
    this.shells.clear();
    const mats = [this.bodyMat, this.eyeMat, this.ringMat, this.graveMat];
    for (const m of [...mats, ...this.shellMats.values()]) m.dispose();
    this.barBackMat.dispose();
    this.barFillMat.dispose();
    this.shellMats.clear();
  }
}
