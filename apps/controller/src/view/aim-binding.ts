import type { AimState, AimStore } from '../controls/aim-store';
import type { ViewCameraMode } from './camera-modes';

/** The slice of {@link CameraController} the binding drives. */
export interface AimCameraLike {
  readonly mode: ViewCameraMode;
  setAimLatched(latched: boolean): void;
  setLocalAim(angle: number | null): void;
  onModeChange(fn: (mode: ViewCameraMode) => void): () => void;
}

/**
 * Keeps the aim store and the camera in step. Store to camera: aim mode on (my turn only) latches
 * the aim camera and the local elevation steers it. Camera to store: when the camera is in aim
 * mode (drag, Aim button, the Camera button) the store says so, and when it leaves aim mode (a
 * shot in flight, a gesture, a new turn) the store clears, which resets the Aim button.
 * Returns a disposer.
 */
export function bindAimMode(camera: AimCameraLike, store: AimStore): () => void {
  const toCamera = (s: Readonly<AimState>): void => {
    camera.setLocalAim(s.aim?.angle ?? null);
    const want = s.myTurn && s.aimMode;
    camera.setAimLatched(want);
    // The camera refused (a shot is in flight): do not leave the button stuck on.
    if (want && camera.mode !== 'aim') store.setAimMode(false);
  };
  const toStore = (mode: ViewCameraMode): void => store.setAimMode(mode === 'aim');
  const offStore = store.subscribe(toCamera);
  const offMode = camera.onModeChange(toStore);
  toCamera(store.state);
  return () => {
    offStore();
    offMode();
  };
}
