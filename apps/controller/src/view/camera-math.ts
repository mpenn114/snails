import type { CameraPose, FreeCameraInput, Point3 } from '@snails/render';

/** Shortest signed angular difference `to - from`, within (-PI, PI]. */
export function angleDiff(from: number, to: number): number {
  const turn = Math.PI * 2;
  let d = (to - from) % turn;
  if (d > Math.PI) d -= turn;
  else if (d <= -Math.PI) d += turn;
  return d;
}

/** Tunables of the over-the-shoulder aim camera. */
export interface AimCameraOptions {
  distance: number;
  basePitch: number;
  /** Extra camera pitch per radian of weapon elevation (tilts the view with the aim). */
  pitchPerElevation: number;
  lookHeight: number;
}

/** Default aim camera tuning. */
export const DEFAULT_AIM_CAMERA: AimCameraOptions = {
  distance: 7,
  basePitch: 0.3,
  pitchPerElevation: 0.35,
  lookHeight: 0.8,
};

/**
 * Over-the-shoulder pose behind a snail: sits behind its facing and tilts with the weapon
 * elevation (`aimAngle`, radians above the facing direction).
 */
export function aimPose(
  snail: Point3,
  facing: number,
  aimAngle: number,
  o: AimCameraOptions = DEFAULT_AIM_CAMERA,
): CameraPose {
  return {
    target: { x: snail.x, y: snail.y + o.lookHeight, z: snail.z },
    yaw: Math.PI - facing,
    pitch: o.basePitch + o.pitchPerElevation * aimAngle,
    distance: o.distance,
  };
}

/** Applies a free-camera input to a pose copy with the same maths as the rig (unclamped). */
export function applyFreeInput(p: CameraPose, input: FreeCameraInput): CameraPose {
  const out: CameraPose = { ...p, target: { ...p.target } };
  if (input.orbitDelta) {
    out.yaw += input.orbitDelta.x;
    out.pitch += input.orbitDelta.y;
  }
  if (input.panDelta) {
    out.target.x += -Math.sin(out.yaw) * input.panDelta.x - Math.cos(out.yaw) * input.panDelta.y;
    out.target.z += Math.cos(out.yaw) * input.panDelta.x - Math.sin(out.yaw) * input.panDelta.y;
  }
  if (input.zoomDelta) out.distance *= Math.exp(input.zoomDelta);
  return out;
}

/** The free-camera input that moves pose `from` onto pose `to` (inverse of {@link applyFreeInput}). */
export function inputToward(from: CameraPose, to: CameraPose): FreeCameraInput {
  const dx = to.target.x - from.target.x;
  const dz = to.target.z - from.target.z;
  const yaw = to.yaw; // orbit is applied before pan, so pan uses the new yaw
  return {
    orbitDelta: { x: angleDiff(from.yaw, to.yaw), y: to.pitch - from.pitch },
    panDelta: {
      x: -Math.sin(yaw) * dx + Math.cos(yaw) * dz,
      y: -Math.cos(yaw) * dx - Math.sin(yaw) * dz,
    },
    zoomDelta: Math.log(to.distance / from.distance),
  };
}
