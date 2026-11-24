/** Aim intent as sent on the wire. */
export interface AimValue {
  angle: number;
  power: number;
}

/**
 * Unit vector of the active snail's facing projected onto the screen (x right, y down, like
 * pointer coordinates). Side view facing right is `(1, 0)`; a camera behind the snail gives
 * `(0, -1)` (forward is screen-up).
 */
export interface ScreenFacing {
  x: number;
  y: number;
}

/** Drag distance (px) below which no aim update is produced. */
export const AIM_MIN_DRAG = 8;

/** Facing used until a snapshot names the active snail: side view, facing screen-right. */
export const DEFAULT_SCREEN_FACING: ScreenFacing = { x: 1, y: 0 };

/**
 * Projects the snail's facing (core yaw `f`, direction `(cos f, -sin f)` in x/z) into screen
 * space for the render rig's camera yaw `c` (camera offset `(cos c, sin c)` from its target,
 * looking at it, so screen-right is `(sin c, -cos c)` and screen-up is `-(cos c, sin c)`).
 * Result: `(sin(f + c), cos(f + c))` in screen coordinates (y down).
 */
export function screenFacing(facingYaw: number, cameraYaw: number): ScreenFacing {
  const a = facingYaw + cameraYaw;
  return { x: Math.sin(a), y: Math.cos(a) };
}

/**
 * Maps a drag vector (screen px, y down) from the drag origin to an aim. Scheme: the drag's
 * component along the snail's on-screen horizontal facing (`dx * facing.x`) is the forward
 * reach, and its vertical component (`-dy`) the lift. Side view therefore aims in the dragged
 * direction. Behind the snail (`facing.x` ~ 0) a constant forward reach of `maxRadius *
 * |facing.y|` is added, so dragging up is steeper and down is flatter. Angles are clamped to
 * +-PI/2 like core; power is drag length over `maxRadius` (0..1). Null inside the dead area.
 */
export function dragToAim(
  dx: number,
  dy: number,
  facing: ScreenFacing,
  maxRadius: number,
): AimValue | null {
  const len = Math.hypot(dx, dy);
  if (len < AIM_MIN_DRAG || maxRadius <= 0) return null;
  const forward = dx * facing.x + maxRadius * Math.abs(facing.y);
  const raw = Math.atan2(-dy, forward);
  const angle = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, raw));
  return { angle, power: Math.min(1, len / maxRadius) };
}

/**
 * Joystick move from a thumb offset (px): its component along the snail's on-screen facing
 * decides forward (`right` on the wire, core move is facing-relative), back (`left`) or stop.
 * Hysteresis: engaging needs `deadzone` px, releasing needs the projection below 60% of it.
 * Only the forward/back axis; the perpendicular axis is `stickToTurn`.
 */
export function stickToWireMove(
  dx: number,
  dy: number,
  facing: ScreenFacing,
  deadzone: number,
  previous: 'left' | 'right' | 'stop' = 'stop',
): 'left' | 'right' | 'stop' {
  const along = dx * facing.x + dy * facing.y;
  const threshold = previous === 'stop' ? deadzone : deadzone * 0.6;
  if (Math.abs(along) < threshold) return 'stop';
  return along > 0 ? 'right' : 'left';
}

/**
 * Turn input (-1..1, quantised to 0.1) from the stick component perpendicular to the snail's
 * on-screen facing: full deflection at `radius` px, none inside `deadzone`. Positive turns the
 * snail counter-clockwise seen from above (core yaw increases): with the snail facing screen-right
 * that is stick-up, and with the camera behind the snail it is stick-left.
 */
export function stickToTurn(
  dx: number,
  dy: number,
  facing: ScreenFacing,
  radius: number,
  deadzone: number,
): number {
  const across = dx * facing.y - dy * facing.x;
  if (radius <= deadzone || Math.abs(across) < deadzone) return 0;
  const v = Math.min(1, (Math.abs(across) - deadzone) / (radius - deadzone));
  return (Math.sign(across) * Math.round(v * 10)) / 10;
}

/** Two-axis joystick move as sent on the wire. */
export interface StickMove {
  direction: 'left' | 'right' | 'stop';
  turn: number;
}

/** Combines `stickToWireMove` (crawl axis) and `stickToTurn` (steer axis) into one move. */
export function stickToMove(
  dx: number,
  dy: number,
  facing: ScreenFacing,
  radius: number,
  deadzone: number,
  previous: StickMove['direction'] = 'stop',
): StickMove {
  return {
    direction: stickToWireMove(dx, dy, facing, deadzone, previous),
    turn: stickToTurn(dx, dy, facing, radius, deadzone),
  };
}
