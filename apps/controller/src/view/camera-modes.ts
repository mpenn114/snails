/** Camera control modes of the phone view. */
export type ViewCameraMode = 'follow' | 'aim' | 'free';

/** Display order of the manual mode toggle. */
export const MODE_CYCLE: readonly ViewCameraMode[] = ['follow', 'aim', 'free'];

/**
 * Pure state machine choosing the camera mode. Auto rules: `turnStart` returns to follow (also
 * leaving free), the local player aiming switches to aim, a projectile in flight switches to
 * follow (the follow rig then lingers on the explosion). A manual toggle cycles modes.
 */
export class CameraModeMachine {
  private current: ViewCameraMode = 'follow';
  private aiming = false;
  private flying = false;

  /** Current mode. */
  get mode(): ViewCameraMode {
    return this.current;
  }

  /** A new turn began: back to follow (aim again if the local player is already aiming). */
  turnStart(): ViewCameraMode {
    this.flying = false;
    this.current = this.aiming ? 'aim' : 'follow';
    return this.current;
  }

  /** The local player started or stopped aiming. */
  setAiming(aiming: boolean): ViewCameraMode {
    const was = this.aiming;
    this.aiming = aiming;
    if (aiming && !was && !this.flying) this.current = 'aim';
    else if (!aiming && was && this.current === 'aim') this.current = 'follow';
    return this.current;
  }

  /** Whether a projectile is in flight; its appearance forces follow, once per shot. */
  setProjectileInFlight(flying: boolean): ViewCameraMode {
    if (flying && !this.flying) this.current = 'follow';
    this.flying = flying;
    return this.current;
  }

  /** Manual toggle: follow, aim, free, follow, ... */
  cycle(): ViewCameraMode {
    const i = MODE_CYCLE.indexOf(this.current);
    this.current = MODE_CYCLE[(i + 1) % MODE_CYCLE.length] as ViewCameraMode;
    return this.current;
  }

  /** Forces free mode (a touch gesture or a minimap tap). */
  enterFree(): ViewCameraMode {
    this.current = 'free';
    return this.current;
  }
}
