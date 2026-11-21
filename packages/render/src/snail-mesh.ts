import * as THREE from 'three';
import {
  BAR_WIDTH,
  SnailAssets,
  canvasLabelFactory,
  type LabelTextureFactory,
} from './snail-assets.js';
import type { SnailView } from './snail-view.js';

/** Placeholder snail built from primitives, with team tint, health bar and name tag. */
export class SnailMesh {
  /** Root group, positioned at the snail. */
  readonly group = new THREE.Group();
  /** Rotated by facing; holds body, shell, eyes. */
  readonly bodyGroup = new THREE.Group();
  /** Billboarded group holding the health bar quads. */
  readonly barGroup = new THREE.Group();
  readonly barFill: THREE.Mesh;
  readonly highlight: THREE.Mesh;
  readonly grave: THREE.Mesh;
  readonly nameTag: THREE.Sprite;
  private readonly shellMaterial = new THREE.MeshStandardMaterial({ roughness: 0.5 });
  private readonly nameMaterial = new THREE.SpriteMaterial({ depthTest: false });
  private baseColour = 0xc98b4a;
  private labelText: string | null = null;
  private labelTexture: THREE.Texture | null = null;

  /**
   * @param shellColour - Team shell colour as a hex number.
   * @param assets - Shared geometries/materials (a private set is made when omitted).
   * @param labelFactory - Name-tag texture factory.
   */
  constructor(
    shellColour = 0xc98b4a,
    assets: SnailAssets = new SnailAssets(),
    private readonly labelFactory: LabelTextureFactory = canvasLabelFactory,
  ) {
    const body = new THREE.Mesh(assets.body, assets.bodyMat);
    body.rotation.z = Math.PI / 2;
    const shell = new THREE.Mesh(assets.shell, this.shellMaterial);
    shell.scale.set(1.1, 1, 0.9);
    shell.position.set(-0.1, 0.5, 0);
    this.bodyGroup.add(body, shell);
    for (const z of [-0.1, 0.1]) {
      const stalk = new THREE.Mesh(assets.stalk, assets.bodyMat);
      stalk.position.set(0.5, 0.3, z);
      const eye = new THREE.Mesh(assets.eye, assets.eyeMat);
      eye.position.set(0.5, 0.47, z);
      this.bodyGroup.add(stalk, eye);
    }
    this.highlight = new THREE.Mesh(assets.ring, assets.ringMat);
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.position.y = 0.02;
    this.highlight.visible = false;
    this.grave = new THREE.Mesh(assets.grave, assets.graveMat);
    this.grave.position.y = 0.3;
    this.grave.visible = false;
    this.barFill = new THREE.Mesh(assets.barFill, assets.barFillMat);
    this.barGroup.add(new THREE.Mesh(assets.barBack, assets.barBackMat), this.barFill);
    this.barGroup.position.set(-BAR_WIDTH / 2, 1.5, 0);
    this.nameTag = new THREE.Sprite(this.nameMaterial);
    this.nameTag.scale.set(1.6, 0.4, 1);
    this.nameTag.position.y = 1.85;
    this.group.add(this.bodyGroup, this.highlight, this.grave, this.barGroup, this.nameTag);
    this.setColour(shellColour);
  }

  /** Sets the shell tint as a hex number. */
  setColour(hex: number): void {
    this.baseColour = hex;
    this.shellMaterial.color.setHex(hex);
  }

  /** Current shell tint as a hex number (damage darkening excluded). */
  get colour(): number {
    return this.baseColour;
  }

  /** Placeholder: darkens the shell as damage (0 = intact, 1 = destroyed). */
  setShellDamage(damage: number): void {
    const d = Math.min(1, Math.max(0, damage));
    this.shellMaterial.roughness = 0.5 + d * 0.5;
    this.shellMaterial.color.setHex(this.baseColour).multiplyScalar(1 - d * 0.5);
  }

  /** Current shell roughness (exposed for tests). */
  get roughness(): number {
    return this.shellMaterial.roughness;
  }

  /** Applies a view: transform, colour, facing, health, name, active and dead state. */
  apply(v: SnailView): void {
    this.group.position.set(v.position.x, v.position.y, v.position.z);
    this.bodyGroup.rotation.y = v.facing;
    if (v.colour !== this.baseColour) this.setColour(v.colour);
    this.bodyGroup.visible = v.alive;
    this.grave.visible = !v.alive;
    this.barGroup.visible = v.alive;
    this.nameTag.visible = v.alive;
    this.highlight.visible = v.alive && v.isActive;
    const frac = v.maxHealth > 0 ? Math.min(1, Math.max(0, v.health / v.maxHealth)) : 0;
    this.barFill.scale.x = Math.max(frac, 1e-4);
    this.barFill.visible = frac > 0;
    this.setName(v.name);
  }

  private setName(name: string): void {
    if (name === this.labelText) return;
    this.labelText = name;
    this.labelTexture?.dispose();
    this.labelTexture = this.labelFactory(name);
    this.nameMaterial.map = this.labelTexture;
    this.nameMaterial.needsUpdate = true;
  }

  /** Health bar fill fraction (0..1), for tests. */
  get healthFraction(): number {
    return this.barFill.visible ? this.barFill.scale.x : 0;
  }

  /** Frees per-snail resources; shared assets are freed by their owner. */
  dispose(): void {
    this.shellMaterial.dispose();
    this.nameMaterial.dispose();
    this.labelTexture?.dispose();
    this.labelTexture = null;
    this.group.removeFromParent();
  }
}
