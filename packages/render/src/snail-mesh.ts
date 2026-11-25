import * as THREE from 'three';
import { MAX_TILT, dampTilt, tiltQuaternion } from './snail/terrain-tilt.js';
import {
  BAR_WIDTH,
  SnailAssets,
  canvasLabelFactory,
  type LabelTextureFactory,
} from './snail-assets.js';
import { EYE_OFFSETS, PUPIL_REST, STALK_ROOTS, shellSeat } from './snail/body-geometry.js';
import { SnailAnimator, type BodyPose } from './snail/snail-anim.js';
import {
  REST_FACE,
  SnailExpression,
  type ExpressionKind,
  type ExpressionPose,
} from './snail/snail-expression.js';
import { hashShellSeed } from './snail/shell-geometry.js';
import { damageForRatio, easeDamage } from './snail/crack-damage.js';
import { shellDamageUniform, shellTierUniforms } from './snail/shell-material.js';
import { advanceTierTransition, beginTierTransition, tierOfKind } from './snail/shell-tier.js';
import {
  DeathTracker,
  deadShellDamage,
  drownFloat,
  isDrowned,
  type DeathState,
} from './snail/death-sequence.js';
import { applyFloat, poseDeathRig } from './snail/death-rig.js';
import { shellPatternForTeam } from './snail/shell-pattern.js';
import { ShellExtras } from './research/shell-extras.js';
import { lookKey, type ShellMaterialKind } from './research/shell-look.js';
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
  /** Eyelid caps (children of the eye pivots); rotation.z sweeps them over the eyeball. */
  lids: [THREE.Mesh, THREE.Mesh];
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
  /** Parent of the body and ring: tilts the snail onto the ground normal (foot is the pivot). */
  readonly tiltGroup = new THREE.Group();
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
  readonly nameTag: THREE.Sprite;
  private readonly nameMaterial = new THREE.SpriteMaterial({ depthTest: false });
  private readonly assets: SnailAssets;
  /** Body animation state (crawl, idle, aim, jump, hurt, retreat). */
  readonly animator: SnailAnimator;
  /** Face state (blink and event reactions). */
  readonly expression: SnailExpression;
  /** Team id of the last applied view (used to fan team-wide reactions out). */
  teamId = '';
  private lastPos: THREE.Vector3 | null = null;
  private speed = 0;
  private vy = 0;
  private elapsed = 0;
  private readonly tiltTarget = new THREE.Quaternion();
  /** Ground normal under the foot set by the layer each frame; null = upright. */
  groundNormal: { x: number; y: number; z: number } | null = null;
  private healthFrac = 1;
  private shellRoughness = 0.5;
  private damage = 0;
  private damageTarget = 0;
  private ownShell: THREE.MeshToonMaterial | null = null;
  private pattern: number;
  private materialKind: ShellMaterialKind | null = null;
  private extras: ShellExtras | null = null;
  private appliedLook = '';
  private baseColour = 0xc98b4a;
  private labelText: string | null = null;
  private labelTexture: THREE.Texture | null = null;
  private labelFactor = 1;
  private labelLiftM = 0;
  private readonly death = new DeathTracker();
  private deathState: DeathState = { phase: 'alive', progress: 0, justDied: false };
  private drownedFlag = false;
  private deadTime = 0;
  private readonly floatPhase: number;
  /** Water surface height used to detect and float drowned shells (null = unknown). */
  waterLevel: number | null = null;
  /** Called once when a watched snail dies, with its world position (spawns the puff). */
  onDied: ((at: THREE.Vector3) => void) | null = null;

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
    const phase = (hashShellSeed(shellSeed, 'anim') % 1000) / 1000;
    this.animator = new SnailAnimator(phase);
    this.expression = new SnailExpression(hashShellSeed(shellSeed, 'blink') | 1);
    this.baseColour = shellColour;
    this.floatPhase = (hashShellSeed(shellSeed, 'float') % 1000) / 1000;
    this.pattern = shellPatternForTeam(pattern);
    this.rig = this.buildRig(shellSeed);
    this.bodyGroup.add(this.rig.squash);
    this.highlight = new THREE.Mesh(assets.ring, assets.ringMat);
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.position.y = 0.02;
    this.highlight.visible = false;
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
    this.tiltGroup.add(this.bodyGroup, this.highlight);
    this.group.add(this.tiltGroup, this.barGroup, this.nameTag);
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
    shell.scale.set(seat.scale, seat.scale, seat.scale);
    shell.position.set(...seat.position);
    squash.add(body, shell);
    const stalks: THREE.Group[] = [];
    const eyes: THREE.Group[] = [];
    const pupils: THREE.Mesh[] = [];
    const lids: THREE.Mesh[] = [];
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
      const lid = new THREE.Mesh(a.parts.lid, a.eyeMat);
      lid.name = side === 0 ? 'lid-left' : 'lid-right';
      lid.visible = false;
      eye.add(pupil, lid);
      pivot.add(eye);
      squash.add(pivot);
      stalks.push(pivot);
      eyes.push(eye);
      pupils.push(pupil);
      lids.push(lid);
    }
    return {
      squash,
      stalks: stalks as SnailRig['stalks'],
      eyes: eyes as SnailRig['eyes'],
      pupils: pupils as SnailRig['pupils'],
      lids: lids as SnailRig['lids'],
      shell,
      body,
    };
  }

  private shellMaterialNow(): THREE.MeshToonMaterial {
    const old = this.ownShell;
    this.ownShell = this.assets.ownedShellMaterial(
      this.baseColour,
      this.pattern,
      this.materialKind,
      this.damage,
    );
    if (old) old.dispose();
    return this.ownShell;
  }

  private refreshShellMaterial(): void {
    this.rig.shell.material = this.shellMaterialNow();
  }

  /** Enables or disables shadow casting on the body and shell (not labels or bars). */
  setCastShadow(on: boolean): void {
    this.rig.squash.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = on && !o.name.startsWith('lid');
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

  /**
   * Sets the target shell damage (0 = intact, 1 = destroyed). Cracks ease toward it over ~0.5 s
   * in {@link animate}; the first call snaps nothing, pass `snap` to jump immediately.
   */
  setShellDamage(damage: number, snap = false): void {
    const d = Math.min(1, Math.max(0, damage));
    this.shellRoughness = 0.5 + d * 0.5;
    this.damageTarget = d;
    if (snap) this.writeDamage(d);
  }

  private writeDamage(d: number): void {
    this.damage = d;
    const m = this.rig.shell.material;
    if (m instanceof THREE.Material) shellDamageUniform(m).value = d;
  }

  /** Current shell roughness (exposed for tests). */
  get roughness(): number {
    return this.shellRoughness;
  }

  /** Starts a cosmetic reaction (squint, wide eyes, retracted stalks, cheer...). */
  react(kind: ExpressionKind, strength = 1): void {
    this.expression.trigger(kind, strength);
    if (kind === 'hit') this.animator.hit(strength);
  }

  /**
   * Advances the body animation and the expression by `dt` seconds for the latest view `v` and
   * poses the rig. Motion facts come from position deltas, so interpolated views work too.
   */
  animate(dt: number, v: SnailView): void {
    this.extras?.update(dt);
    this.deathState = this.death.update(v.alive, dt);
    if (this.deathState.justDied) this.onDied?.(this.group.position);
    const sm = this.rig.shell.material;
    if (sm instanceof THREE.Material) advanceTierTransition(shellTierUniforms(sm), dt);
    const here = this.group.position;
    if (dt > 0 && this.lastPos) {
      const ease = 1 - Math.exp(-14 * dt);
      const sp = Math.min(6, Math.hypot(here.x - this.lastPos.x, here.z - this.lastPos.z) / dt);
      this.speed += (sp - this.speed) * ease;
      const vy = Math.max(-20, Math.min(20, (here.y - this.lastPos.y) / dt));
      this.vy += (vy - this.vy) * ease;
    }
    this.lastPos = (this.lastPos ?? new THREE.Vector3()).copy(here);
    this.elapsed += dt;
    this.updateTilt(dt, v);
    const pose = this.animator.update(dt, {
      speed: this.speed,
      vy: this.vy,
      grounded: v.grounded !== false,
      aiming: v.aiming === true,
      aimAngle: v.aimAngle ?? 0,
      retreating: v.retreating === true,
    });
    this.healthFrac = v.maxHealth > 0 ? v.health / v.maxHealth : 1;
    const dying = this.deathState.phase !== 'alive';
    const dmg = damageForRatio(this.healthFrac);
    this.setShellDamage(dying ? deadShellDamage(dmg) : dmg);
    if (this.damage !== this.damageTarget) {
      this.writeDamage(easeDamage(this.damage, this.damageTarget, dt));
    }
    const worry = Math.max(0, 1 - this.healthFrac / 0.3);
    const face = this.expression.update(dt, v.alive ? worry : 0);
    if (dying) this.poseDeath(dt, v);
    else this.poseRig(pose, face);
  }

  /** Eases the tilt group towards the ground normal (upright when airborne or dead). */
  private updateTilt(dt: number, v: SnailView): void {
    const on = v.alive && v.grounded !== false && this.deathState.phase === 'alive';
    tiltQuaternion(on ? this.groundNormal : null, MAX_TILT, this.tiltTarget);
    dampTilt(this.tiltGroup.quaternion, this.tiltTarget, dt);
  }

  /** Marks the death as a drowning (from a `snailDrowned` event). */
  markDrowned(): void {
    this.drownedFlag = true;
  }

  /** Death sequence phase, for tests. */
  get deathPhase(): DeathState['phase'] {
    return this.deathState.phase;
  }

  /** Poses the dying body, then floats a drowned shell on the water. */
  private poseDeath(dt: number, v: SnailView): void {
    const r = this.rig;
    poseDeathRig(r, this.deathState);
    r.squash.scale.set(1, 1, 1);
    r.squash.position.y = 0;
    r.squash.rotation.z = 0;
    r.shell.rotation.z = 0;
    for (const l of r.lids) l.visible = false;
    this.deadTime += dt;
    const w = this.waterLevel;
    const off =
      w !== null && isDrowned(this.drownedFlag, v.position.y, w)
        ? drownFloat(v.position.y, w, this.deadTime, this.floatPhase)
        : null;
    applyFloat(this.bodyGroup, r.squash, off);
  }

  /** Writes a body pose and a face pose onto the rig transforms. */
  private poseRig(pose: BodyPose, face: ExpressionPose = REST_FACE): void {
    const r = this.rig;
    r.squash.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);
    r.squash.position.y = pose.lift;
    r.squash.rotation.z = pose.lean;
    r.shell.rotation.z = pose.shellRock;
    const glance = 0.18 * Math.sin(this.elapsed * 0.9);
    for (const i of [0, 1] as const) {
      const sign = i === 0 ? 1 : -1;
      const stalk = r.stalks[i];
      stalk.rotation.z = -(pose.stalkTilt + face.droop);
      stalk.rotation.x = sign * (pose.stalkSway + 0.12 * face.droop);
      const wide = 1 - 0.4 * face.retract;
      stalk.scale.set(wide, 1 - 0.68 * face.retract + 0.14 * face.stretch, wide);
      const closed = Math.min(1, Math.max(0, face.lid[i]));
      const lid = r.lids[i];
      lid.visible = closed > 0.01;
      lid.rotation.z = Math.PI / 2 - closed * Math.PI;
      lid.scale.setScalar(0.9 + 0.17 * Math.min(1, closed * 6));
      const eye = r.eyes[i];
      eye.rotation.z = face.look[1] * 0.7;
      eye.rotation.y = glance * (1 - closed) + 0.1 * face.look[0];
      r.pupils[i].scale.setScalar(face.pupil);
    }
  }

  /** Applies a view: transform, colour, facing, health, name, active and dead state. */
  apply(v: SnailView): void {
    this.group.position.set(v.position.x, v.position.y, v.position.z);
    this.teamId = v.teamId;
    this.bodyGroup.rotation.y = v.facing;
    if (v.colour !== this.baseColour) this.setColour(v.colour);
    this.setPattern(v.teamIndex);
    this.bodyGroup.visible = true;
    this.barGroup.visible = v.alive;
    this.nameTag.visible = v.alive && v.isActive;
    this.highlight.visible = v.alive && v.isActive;
    const frac = v.maxHealth > 0 ? Math.min(1, Math.max(0, v.health / v.maxHealth)) : 0;
    this.barFill.scale.x = Math.max(frac, 1e-4);
    this.barFill.visible = frac > 0;
    this.setName(v.name);
    this.applyResearch(v);
  }

  /** Applies the team's research look (material, attachments, glow) and the shimmer flag. */
  private applyResearch(v: SnailView): void {
    const r = v.research;
    const kind = r?.look.material ?? null;
    if (kind !== this.materialKind) {
      this.materialKind = kind;
      const m = this.rig.shell.material;
      if (m instanceof THREE.Material) beginTierTransition(shellTierUniforms(m), tierOfKind(kind));
    }
    // Created eagerly: the team decal and active flag show even without research.
    if (!this.extras) {
      this.extras = new ShellExtras(this.rig.shell.geometry);
      this.rig.shell.add(this.extras.group);
    }
    const key = r ? lookKey(r.look) : '';
    if (key !== this.appliedLook) {
      this.appliedLook = key;
      if (r) this.extras.setLook(r.look);
    }
    this.extras.setTeam(v.teamIndex, v.colour);
    this.extras.setFlag(v.alive && v.isActive);
    this.extras.setShimmer(v.alive && r?.researching === true);
  }

  /** Decoration of the shell (decal, flag, research attachments); null before the first view. */
  get shellExtras(): ShellExtras | null {
    return this.extras;
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
    this.ownShell?.dispose();
    this.extras?.dispose();
    this.labelTexture?.dispose();
    this.labelTexture = null;
    this.group.removeFromParent();
  }
}
