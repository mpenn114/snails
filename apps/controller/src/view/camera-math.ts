import type { CameraPose, FreeCameraInput, Point3 } from '@snails/render';

/** Shortest signed angular difference `to - from`, within (-PI, PI]. */
export function angleDiff(from: number, to: number): number {
  const turn = Math.PI * 2;
  let d = (to - from) % turn;
  if (d > Math.PI) d -= turn;
  else if (d <= -Math.PI) d += turn;
  return d;
}

/** Tunables of the snail's point-of-view aim camera. */
export interface AimCameraOptions {
  /** Eye height above the snail's position (metres). */
  eyeHeight: number;
  /** How far behind the snail's position the eye sits along its facing (metres). */
  eyeBack: number;
  /** Distance from the eye to the look-at point (the orbit radius of the rig). */
  lookDistance: number;
  /** View tilt at zero aim elevation (negative looks down, keeping the snail and ground in frame). */
  baseLook: number;
  /** Share of the aim elevation the view tilts by, so the reticle moves on screen as you aim. */
  lookGain: number;
  /** Look elevation limits (radians): the camera never tilts past these. */
  minLook: number;
  maxLook: number;
}

/** Default aim camera tuning. */
export const DEFAULT_AIM_CAMERA: AimCameraOptions = {
  eyeHeight: 2.4,
  eyeBack: 4.6,
  lookDistance: 10,
  baseLook: -0.25,
  lookGain: 0.4,
  minLook: -0.4,
  maxLook: 0.45,
};

/** Lowest camera pitch the aim pose uses; the phone rig's `minPitch` limit must allow it. */
export const AIM_MIN_PITCH = -DEFAULT_AIM_CAMERA.maxLook;

/**
 * Snail's point-of-view pose: the eye sits behind and above the snail and looks along its
 * facing, tilted down a little (`baseLook`) and by part (`lookGain`) of the weapon elevation (`aimAngle`, radians),
 * so the view stays on the terrain ahead while the reticle (at the full aim direction) moves
 * across it. The rig orbits a look-at point `lookDistance` ahead, so looking up means the
 * camera is below that point (negative pitch).
 */
export function aimPose(
  snail: Point3,
  facing: number,
  aimAngle: number,
  o: AimCameraOptions = DEFAULT_AIM_CAMERA,
): CameraPose {
  const look = Math.min(o.maxLook, Math.max(o.minLook, o.baseLook + aimAngle * o.lookGain));
  const fx = Math.cos(facing);
  const fz = -Math.sin(facing);
  const eye = {
    x: snail.x - fx * o.eyeBack,
    y: snail.y + o.eyeHeight,
    z: snail.z - fz * o.eyeBack,
  };
  const horizontal = Math.cos(look) * o.lookDistance;
  return {
    target: {
      x: eye.x + fx * horizontal,
      y: eye.y + Math.sin(look) * o.lookDistance,
      z: eye.z + fz * horizontal,
    },
    yaw: Math.PI - facing,
    pitch: -look,
    distance: o.lookDistance,
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
