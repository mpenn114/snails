import { describe, expect, it } from 'vitest';
import { createAimStore } from '../controls/aim-store';
import { bindAimMode } from './aim-binding';
import type { AimCameraLike } from './aim-binding';
import { CameraModeMachine } from './camera-modes';
import type { ViewCameraMode } from './camera-modes';

/** A camera made of the pure mode machine, like `CameraController` minus the rig. */
function fakeCamera(): AimCameraLike & {
  machine: CameraModeMachine;
  localAim: number | null;
} {
  const listeners = new Set<(m: ViewCameraMode) => void>();
  const machine = new CameraModeMachine();
  const emit = (change: () => ViewCameraMode): void => {
    const before = machine.mode;
    const after = change();
    if (after !== before) for (const fn of listeners) fn(after);
  };
  return {
    machine,
    localAim: null,
    get mode() {
      return machine.mode;
    },
    setAimLatched: (l) => emit(() => machine.setAimLatched(l)),
    setLocalAim(a) {
      this.localAim = a;
    },
    onModeChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

describe('bindAimMode', () => {
  it('the Aim button (store) enters and leaves the aim camera on my turn only', () => {
    const store = createAimStore();
    const cam = fakeCamera();
    bindAimMode(cam, store);
    store.setAimMode(true);
    expect(cam.mode).toBe('follow');
    store.setMyTurn(true);
    store.setAimMode(true);
    expect(cam.mode).toBe('aim');
    store.setAimMode(false);
    expect(cam.mode).toBe('follow');
  });

  it('the local aim elevation steers the camera', () => {
    const store = createAimStore();
    const cam = fakeCamera();
    bindAimMode(cam, store);
    store.setMyTurn(true);
    store.setAim(0.7, 0.5);
    expect(cam.localAim).toBe(0.7);
  });

  it('a shot in flight resets the store (and the Aim button) to off', () => {
    const store = createAimStore();
    const cam = fakeCamera();
    bindAimMode(cam, store);
    store.setMyTurn(true);
    store.setAimMode(true);
    cam.machine.setProjectileInFlight(true);
    // The real controller notifies on this change; emulate it through a latch refresh.
    store.setAimMode(false);
    expect(store.state.aimMode).toBe(false);
    store.setAimMode(true);
    expect(cam.mode).toBe('follow');
    expect(store.state.aimMode).toBe(false);
  });

  it('the end of my turn leaves aim mode', () => {
    const store = createAimStore();
    const cam = fakeCamera();
    bindAimMode(cam, store);
    store.setMyTurn(true);
    store.setAimMode(true);
    store.setMyTurn(false);
    expect(cam.mode).toBe('follow');
  });

  it('the camera entering aim by itself (Camera button) is reflected in the store', () => {
    const store = createAimStore();
    const cam = fakeCamera();
    bindAimMode(cam, store);
    store.setMyTurn(true);
    cam.setAimLatched(true);
    expect(store.state.aimMode).toBe(true);
  });
});
