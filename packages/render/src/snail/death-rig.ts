import type * as THREE from 'three';
import { deathPose, type DeathState, type FloatOffset } from './death-sequence.js';

/** The rig parts the death pose touches (structurally a subset of `SnailRig`). */
export interface DeathRigParts {
  squash: THREE.Group;
  body: THREE.Mesh;
  stalks: [THREE.Group, THREE.Group];
  pupils: [THREE.Mesh, THREE.Mesh];
}

/**
 * Poses the rig for a death state: during the sequence the body shrinks and slides out of the
 * shell with X-ish eyes; once dead only the shell remains. Alive restores the parts.
 */
export function poseDeathRig(rig: DeathRigParts, state: DeathState): void {
  const dead = state.phase === 'dead';
  const pose = deathPose(state.progress);
  const live = state.phase === 'alive';
  const s = live ? 1 : pose.bodyScale;
  rig.body.visible = !dead;
  rig.body.scale.setScalar(s);
  rig.body.position.x = live ? 0 : pose.slide;
  for (let i = 0; i < 2; i++) {
    const stalk = rig.stalks[i] as THREE.Group;
    stalk.visible = !dead;
    if (!live) stalk.scale.setScalar(Math.max(s, 1e-4));
    const pupil = rig.pupils[i] as THREE.Mesh;
    pupil.rotation.z = pose.xEyes ? Math.PI / 4 : 0;
    if (pose.xEyes) pupil.scale.set(1.6, 0.3, 1.6);
  }
}

/** Applies (or clears, with `null`) the drowned-shell float offset on the body group. */
export function applyFloat(
  bodyGroup: THREE.Object3D,
  squash: THREE.Object3D,
  off: FloatOffset | null,
): void {
  bodyGroup.position.set(off?.dx ?? 0, off?.y ?? 0, off?.dz ?? 0);
  squash.rotation.x = off?.roll ?? 0;
}
