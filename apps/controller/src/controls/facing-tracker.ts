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
 * TODO: the phone view does not expose its camera yaw yet, so the camera's right vector is
 * assumed to be world +x (yaw 0, the side-on view). Pass the real yaw once available.
 */
export function trackFacingSign(client: ControllerClient): {
  facingSign: () => 1 | -1;
  dispose: () => void;
} {
  let sign: 1 | -1 = 1;
  const off = client.on('snapshot', (s) => {
    sign = activeFacingSign(s.snails, s.turn[1]);
  });
  return { facingSign: () => sign, dispose: off };
}
