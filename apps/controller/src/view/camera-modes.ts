/** Camera control modes of the phone view. */
export type ViewCameraMode = 'follow' | 'aim' | 'free' | 'eye';

/** Display order of the manual mode toggle. */
export const MODE_CYCLE: readonly ViewCameraMode[] = ['follow', 'aim', 'free', 'eye'];

/**
 * Pure state machine choosing the camera mode. Aim mode is entered by a latch (the Aim button or
 * the start of an aim drag, see `setAimLatched`) and stays until the latch is released, a shot is
 * in flight, a gesture takes over, or a new turn starts. Eye mode (the snail's point of view) is
 * a sticky preference chosen with the manual toggle: it survives new turns and shots. Other auto
 * rules: `turnStart` returns to follow (or eye), a projectile in flight switches to follow (the follow rig then lingers on the
 * explosion). A manual toggle cycles modes.
 */
export class CameraModeMachine {
  private current: ViewCameraMode = 'follow';
  private aiming = false;
  private latched = false;
  private flying = false;
  private eyePreferred = false;

  private home(): ViewCameraMode {
    return this.eyePreferred ? 'eye' : 'follow';
  }

  /** Current mode. */
  get mode(): ViewCameraMode {
    return this.current;
  }

  /** Whether aim mode is latched on (it stays after an aim drag ends). */
  get aimLatched(): boolean {
    return this.latched;
  }

  /** A new turn began: back to follow (aim again if the local player is already dragging). */
  turnStart(): ViewCameraMode {
    this.flying = false;
    this.latched = false;
    this.current = this.aiming ? 'aim' : this.home();
    return this.current;
  }

  /** The local player started or stopped an aim drag (aim mode lasts only while dragging). */
  setAiming(aiming: boolean): ViewCameraMode {
    const was = this.aiming;
    this.aiming = aiming;
    if (aiming && !was && !this.flying) this.current = 'aim';
    else if (!aiming && was && this.current === 'aim' && !this.latched) this.current = this.home();
    return this.current;
  }

  /**
   * Latches aim mode on (the Aim button, or an aim drag that should stay) or off (back to follow,
   * or to aim while a drag is still in progress). Ignored while a shot is in flight.
   */
  setAimLatched(latched: boolean): ViewCameraMode {
    if (latched && this.flying) return this.current;
    this.latched = latched;
    if (latched) this.current = 'aim';
    else if (this.current === 'aim' && !this.aiming) this.current = this.home();
    return this.current;
  }

  /** Whether a projectile is in flight; its appearance forces follow, once per shot. */
  setProjectileInFlight(flying: boolean): ViewCameraMode {
    if (flying && !this.flying) {
      this.current = this.home();
      this.latched = false;
    }
    this.flying = flying;
    return this.current;
  }

  /** Manual toggle: follow, aim, free, follow, ... */
  cycle(): ViewCameraMode {
    const i = MODE_CYCLE.indexOf(this.current);
    this.current = MODE_CYCLE[(i + 1) % MODE_CYCLE.length] as ViewCameraMode;
    this.latched = this.current === 'aim';
    this.eyePreferred = this.current === 'eye';
    return this.current;
  }

  /** Forces free mode (a touch gesture or a minimap tap); this also releases the aim latch. */
  enterFree(): ViewCameraMode {
    this.current = 'free';
    this.latched = false;
    return this.current;
  }
}
