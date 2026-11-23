import type { ControllerClient } from '../net/client';
import { DEFAULT_SCREEN_FACING, screenFacing } from './aim-mapping';
import type { ScreenFacing } from './aim-mapping';

/** Screen facing of the active snail from a snapshot (side-view default when it is absent). */
export function activeScreenFacing(
  snails: readonly (readonly [string, ...unknown[]])[],
  activeSnailId: string | null,
  cameraYaw = Math.PI / 2,
): ScreenFacing {
  const s = snails.find((n) => n[0] === activeSnailId);
  const facingMrad = s?.[7];
  return typeof facingMrad === 'number'
    ? screenFacing(facingMrad / 1000, cameraYaw)
    : DEFAULT_SCREEN_FACING;
}

/**
 * Tracks the active snail's facing from snapshots and exposes its on-screen direction.
 * `cameraYaw` is read on every call (the camera orbits between snapshots); pass
 * `() => phone.handle.cameraYaw()`. Defaults to the side-on view (yaw PI/2).
 */
export function trackScreenFacing(
  client: ControllerClient,
  cameraYaw: () => number = () => Math.PI / 2,
): {
  screenFacing: () => ScreenFacing;
  dispose: () => void;
} {
  let snails: readonly (readonly [string, ...unknown[]])[] = [];
  let active: string | null = null;
  const off = client.on('snapshot', (s) => {
    snails = s.snails;
    active = s.turn[1];
  });
  return { screenFacing: () => activeScreenFacing(snails, active, cameraYaw()), dispose: off };
}
