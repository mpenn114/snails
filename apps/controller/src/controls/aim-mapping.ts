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
 * faces screen-left. Angles are clamped to +-PI/2 like core. Power is the drag
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
  const raw = Math.atan2(-dy, dx * facingSign);
  // Core only aims within +-PI/2 of the facing; dragging behind aims straight up (same as server).
  const angle = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, raw));
  return { angle, power: Math.min(1, len / maxRadius) };
}

/** Derives the screen facing sign from the snail's world yaw and the camera's right-vector yaw. */
export function facingSignFromYaw(yaw: number, cameraRightYaw = 0): 1 | -1 {
  return Math.cos(yaw - cameraRightYaw) >= 0 ? 1 : -1;
}

/**
 * Yaw (core facing convention, direction `(cos y, -sin y)` in x/z) of the camera's screen-right
 * vector, from the render rig's camera yaw (camera offset `(cos yaw, sin yaw)` from its target,
 * looking at it). Rig yaw PI/2 (camera on +z, side-on) gives 0: right is world +x.
 */
export function cameraRightYaw(cameraYaw: number): number {
  return Math.PI / 2 - cameraYaw;
}

/**
 * Converts a screen-space move (`left`/`right` on screen) into the wire direction. Core's `move`
 * is relative to the snail's facing (`right` = forward, `left` = backward, no turning), so when
 * the snail faces screen-left the two are swapped.
 */
export function screenToWireMove(
  screen: 'left' | 'right' | 'stop',
  facingSign: 1 | -1,
): 'left' | 'right' | 'stop' {
  if (screen === 'stop' || facingSign === 1) return screen;
  return screen === 'left' ? 'right' : 'left';
}
