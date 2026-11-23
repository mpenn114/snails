import type { ControllerClient } from '../net/client';
import { facingSignFromYaw } from './aim-mapping';

/** Picks the screen facing sign of the active snail from a snapshot (+1 when it is absent). */
export function activeFacingSign(
  snails: readonly (readonly [string, ...unknown[]])[],
  activeSnailId: string | null,
  cameraRightYaw = 0,
): 1 | -1 {
  const s = snails.find((n) => n[0] === activeSnailId);
  const facingMrad = s?.[7];
  return typeof facingMrad === 'number' ? facingSignFromYaw(facingMrad / 1000, cameraRightYaw) : 1;
}

/**
 * Tracks the active snail's facing from snapshots and exposes it as the controls' `facingSign`.
 * `cameraRightYaw` is read on every call (the camera orbits between snapshots); pass
 * `() => cameraRightYaw(handle.cameraYaw())` from the phone view handle. Defaults to the
 * side-on view (right = world +x).
 */
export function trackFacingSign(
  client: ControllerClient,
  cameraRight: () => number = () => 0,
): {
  facingSign: () => 1 | -1;
  dispose: () => void;
} {
  let snails: readonly (readonly [string, ...unknown[]])[] = [];
  let active: string | null = null;
  const off = client.on('snapshot', (s) => {
    snails = s.snails;
    active = s.turn[1];
  });
  return { facingSign: () => activeFacingSign(snails, active, cameraRight()), dispose: off };
}
