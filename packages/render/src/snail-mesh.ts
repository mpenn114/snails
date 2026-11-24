import * as THREE from 'three';
import {
  BAR_WIDTH,
  SnailAssets,
  canvasLabelFactory,
  type LabelTextureFactory,
} from './snail-assets.js';
import { EYE_OFFSETS, PUPIL_REST, STALK_ROOTS, shellSeat } from './snail/body-geometry.js';
import { DAMAGE_STEPS } from './snail/shell-material.js';
import { shellPatternForTeam } from './snail/shell-pattern.js';
import type { SnailView } from './snail-view.js';

/** Where the health bar and name tag start above the sole (just over the shell top). */
const LABEL_BASE_Y = 1.38;

/** Named animation hooks of a snail (stalk pivots, pupils, squash); see M7-08/M7-09. */
export interface SnailRig {
  /** Scaled for squash and stretch; origin on the sole, holds body, shell and stalks. */
  squash: THREE.Group;
  /** Stalk pivots (rotate to droop, tilt or retract); index 0 is +Z, 1 is -Z. */
  stalks: [THREE.Group, THREE.Group];
  /** Eye pivots at the eyeball centres (rotate to look). */
  eyes: [THREE.Group, THREE.Group];
  /** Pupil meshes; move `position` (eye space) to look around. */
  pupils: [THREE.Mesh, THREE.Mesh];
  /** Shell mesh. */
  shell: THREE.Mesh;
  /** Body mesh. */
  body: THREE.Mesh;
}

/** Chunky snail with a patterned team-coloured shell, health bar and name tag. */
export class SnailMesh {
  /** Root group, positioned at the snail. */
  readonly group = new THREE.Group();
  /** Rotated by facing; holds body, shell, eyes. */
  readonly bodyGroup = new THREE.Group();
  /** Billboarded group holding the health bar quads. */
  readonly barGroup = new THREE.Group();
  /**
   * Called right before the bar's world matrix is computed each frame, so the bar can face the
   * camera at its final pose for the frame (set by SnailLayer).
   */
  billboard: (() => void) | null = null;
  /** Animation hooks (named child objects of the rig). */
  readonly rig: SnailRig;
  readonly barFill: THREE.Mesh;
  readonly highlight: THREE.Mesh;
  readonly grave: THREE.Mesh;
  readonly nameTag: THREE.Sprite;
  private readonly nameMaterial = new THREE.SpriteMaterial({ depthTest: false });
  private readonly assets: SnailAssets;
  private shellRoughness = 0.5;
  private damageStep = 0;
  private pattern: number;
  private baseColour = 0xc98b4a;
  private labelText: string | null = null;
  private labelTexture: THREE.Texture | null = null;
  private labelFactor = 1;
  private labelLiftM = 0;

  /**
   * @param shellColour - Team shell colour as a hex number.
   * @param assets - Shared geometries/materials (a private set is made when omitted).
   * @param labelFactory - Name-tag texture factory.
   * @param shellSeed - Seed of the procedural shell shape.
   * @param pattern - Shell pattern id (team slot; wrapped into range).
   */
  constructor(
    shellColour = 0xc98b4a,
    assets: SnailAssets = new SnailAssets(),
    private readonly labelFactory: LabelTextureFactory = canvasLabelFactory,
    shellSeed = 0,
    pattern = 0,
  ) {
    this.assets = assets;
    this.baseColour = shellColour;
    this.pattern = shellPatternForTeam(pattern);
    this.rig = this.buildRig(shellSeed);
    this.bodyGroup.add(this.rig.squash);
    this.highlight = new THREE.Mesh(assets.ring, assets.ringMat);
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.position.y = 0.02;
    this.highlight.visible = false;
    this.grave = new THREE.Mesh(assets.grave, assets.graveMat);
    this.grave.position.y = 0.3;
    this.grave.visible = false;
    this.barFill = new THREE.Mesh(assets.barFill, assets.barFillMat);
    const barBack = new THREE.Mesh(assets.barBack, assets.barBackMat);
    // Quads are left-anchored; shift them so the billboard pivot is the bar centre.
    barBack.position.x = this.barFill.position.x = -BAR_WIDTH / 2;
    barBack.renderOrder = 1000;
    this.barFill.renderOrder = 1001;
    this.barGroup.add(barBack, this.barFill);
    this.barGroup.updateMatrixWorld = (force?: boolean): void => {
      this.billboard?.();
      THREE.Object3D.prototype.updateMatrixWorld.call(this.barGroup, force);
    };
    this.nameTag = new THREE.Sprite(this.nameMaterial);
    this.nameTag.renderOrder = 1002;
    this.setLabelScale(1);
    this.group.add(this.bodyGroup, this.highlight, this.grave, this.barGroup, this.nameTag);
  }

  private buildRig(shellSeed: number): SnailRig {
    const a = this.assets;
    const squash = new THREE.Group();
    squash.name = 'squash';
    const body = new THREE.Mesh(a.body, a.bodyMat);
    body.name = 'snail-body';
    const shell = new THREE.Mesh(a.shellGeometry(shellSeed), this.shellMaterialNow());
    shell.name = 'snail-shell';
    const seat = shellSeat(a.shellGeometry(shellSeed).boundingBox as THREE.Box3);
    shell.scale.set(seat.scale, seat.scale, seat.scale * 1.25);
    shell.position.set(...seat.position);
    squash.add(body, shell);
    const stalks: THREE.Group[] = [];
    const eyes: THREE.Group[] = [];
    const pupils: THREE.Mesh[] = [];
    for (const side of [0, 1] as const) {
      const pivot = new THREE.Group();
      pivot.name = side === 0 ? 'stalk-left' : 'stalk-right';
      pivot.position.set(...(STALK_ROOTS[side] as readonly [number, number, number]));
      pivot.add(new THREE.Mesh(a.parts.stalks[side], a.eyeMat));
      const eye = new THREE.Group();
      eye.name = side === 0 ? 'eye-left' : 'eye-right';
      eye.position.set(...(EYE_OFFSETS[side] as readonly [number, number, number]));
      const pupil = new THREE.Mesh(a.parts.pupil, a.eyeMat);
      pupil.name = side === 0 ? 'pupil-left' : 'pupil-right';
      pupil.position.set(...PUPIL_REST);
      eye.add(pupil);
      pivot.add(eye);
      squash.add(pivot);
      stalks.push(pivot);
      eyes.push(eye);
      pupils.push(pupil);
    }
    return {
      squash,
      stalks: stalks as SnailRig['stalks'],
      eyes: eyes as SnailRig['eyes'],
      pupils: pupils as SnailRig['pupils'],
      shell,
      body,
    };
  }

  private shellMaterialNow(): THREE.MeshToonMaterial {
    return this.assets.shellMaterial(this.baseColour, this.pattern, this.damageStep);
  }

  private refreshShellMaterial(): void {
    this.rig.shell.material = this.shellMaterialNow();
  }

  /** Enables or disables shadow casting on the body and shell (not labels or bars). */
  setCastShadow(on: boolean): void {
    this.rig.squash.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = on;
    });
  }

  /**
   * Scales the health bar and name tag by `factor` (1 = base size) and re-stacks them above
   * the snail (plus any declutter lift), so they keep a readable on-screen size at distance.
   */
  setLabelScale(factor: number): void {
    this.labelFactor = factor;
    this.barGroup.scale.setScalar(factor);
    this.barGroup.position.y = LABEL_BASE_Y + 0.1 * factor + this.labelLiftM;
    this.nameTag.scale.set(2.4 * factor, 0.6 * factor, 1);
    this.nameTag.position.y = this.barGroup.position.y + 0.35 * factor;
  }

  /**
   * Lifts the whole bar and name-tag stack by `metres` (declutter). Persists across
   * {@link setLabelScale} so the per-frame re-billboard cannot undo it.
   */
  setLabelLift(metres: number): void {
    this.labelLiftM = Math.max(0, metres);
    this.setLabelScale(this.labelFactor);
  }

  /** Current declutter lift in metres. */
  get labelLift(): number {
    return this.labelLiftM;
  }

  /** Current label scale factor. */
  get labelScale(): number {
    return this.labelFactor;
  }

  /** Sets the shell tint as a hex number. */
  setColour(hex: number): void {
    this.baseColour = hex;
    if (this.rig) this.refreshShellMaterial();
  }

  /** Sets the shell pattern (team slot, wrapped into range). */
  setPattern(pattern: number): void {
    const p = shellPatternForTeam(pattern);
    if (p === this.pattern) return;
    this.pattern = p;
    this.refreshShellMaterial();
  }

  /** Current shell pattern id. */
  get patternId(): number {
    return this.pattern;
  }

  /** Current shell tint as a hex number (damage darkening excluded). */
  get colour(): number {
    return this.baseColour;
  }

  /** Darkens the shell as damage (0 = intact, 1 = destroyed) in shared, quantised steps. */
  setShellDamage(damage: number): void {
    const d = Math.min(1, Math.max(0, damage));
    this.shellRoughness = 0.5 + d * 0.5;
    this.damageStep = Math.round(d * DAMAGE_STEPS);
    this.refreshShellMaterial();
  }

  /** Current shell roughness (exposed for tests). */
  get roughness(): number {
    return this.shellRoughness;
  }

  /** Applies a view: transform, colour, facing, health, name, active and dead state. */
  apply(v: SnailView): void {
    this.group.position.set(v.position.x, v.position.y, v.position.z);
    this.bodyGroup.rotation.y = v.facing;
    if (v.colour !== this.baseColour) this.setColour(v.colour);
    this.setPattern(v.teamIndex);
    this.bodyGroup.visible = v.alive;
    this.grave.visible = !v.alive;
    this.barGroup.visible = v.alive;
    this.nameTag.visible = v.alive && v.isActive;
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
    this.nameMaterial.dispose();
    this.labelTexture?.dispose();
    this.labelTexture = null;
    this.group.removeFromParent();
  }
}
