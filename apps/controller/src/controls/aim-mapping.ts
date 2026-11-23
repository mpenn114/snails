/** Aim intent as sent on the wire. */
export interface AimValue {
  angle: number;
  power: number;
}

/** Drag distance (px) below which no aim update is produced. */
export const AIM_MIN_DRAG = 8;

/**
 * Maps a drag vector (screen px, y down) from the drag origin to an aim. The angle is elevation
 * above the horizontal in the snail's facing direction, matching core (`sin` = up, `cos` =
 * forward). `facingSign` is +1 when the snail faces screen-right (given the camera), -1 when it
 * faces screen-left. Dragging backwards yields |angle| > PI/2 (a shot behind). Power is the drag
 * length over `maxRadius`, clamped to 0..1. Returns null inside the minimum-drag dead area.
 */
export function dragToAim(
  dx: number,
  dy: number,
  facingSign: 1 | -1,
  maxRadius: number,
): AimValue | null {
  const len = Math.hypot(dx, dy);
  if (len < AIM_MIN_DRAG || maxRadius <= 0) return null;
  const angle = Math.atan2(-dy, dx * facingSign);
  return { angle, power: Math.min(1, len / maxRadius) };
}

/** Derives the screen facing sign from the snail's world yaw and the camera's right-vector yaw. */
export function facingSignFromYaw(yaw: number, cameraRightYaw = 0): 1 | -1 {
  return Math.cos(yaw - cameraRightYaw) >= 0 ? 1 : -1;
}
