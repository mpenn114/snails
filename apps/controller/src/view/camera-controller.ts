import type { GameSnapshot } from '@snails/core';
import type { CameraMode, CameraPose, FreeCameraInput } from '@snails/render';
import { CameraModeMachine } from './camera-modes';
import type { ViewCameraMode } from './camera-modes';
import { aimPose, applyFreeInput, inputToward } from './camera-math';

/** The slice of `CameraRig` this controller drives. */
export interface RigLike {
  readonly mode: CameraMode;
  setMode(mode: CameraMode): void;
  setTarget(target: null): void;
  pose(): CameraPose;
  applyInput(input: FreeCameraInput): void;
  setFreePose(pose: CameraPose): void;
}

/**
 * Glue between {@link CameraModeMachine} and the render `CameraRig`. Follow mode is the rig's own
 * (it tracks the active snail, then the projectile and a lingering explosion). Aim and free use
 * the rig's free mode: aim sets its free pose each frame to the snail's point-of-view pose, free applies
 * gesture input. A local mirror of the free pose lets targets be expressed as pose deltas.
 */
export class CameraController {
  private readonly machine = new CameraModeMachine();
  private mirror: CameraPose | null = null;
  private applied: ViewCameraMode | null = null;
  private snapshot: GameSnapshot | null = null;
  private readonly previews = new Map<string, number>();
  private localAim: number | null = null;
  private readonly listeners = new Set<(mode: ViewCameraMode) => void>();

  constructor(private readonly rig: RigLike) {}

  /** Current mode. */
  get mode(): ViewCameraMode {
    return this.machine.mode;
  }

  /** Subscribes to mode changes; returns an unsubscribe function. */
  onModeChange(fn: (mode: ViewCameraMode) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** `turnStart` received: follow the new active snail. */
  turnStart(): void {
    this.previews.clear();
    this.emitAfter(() => this.machine.turnStart());
  }

  /** Called by the controls while the local player is aiming. */
  setAiming(aiming: boolean): void {
    this.emitAfter(() => this.machine.setAiming(aiming));
  }

  /** Latches the aim camera on or off (the Aim button; an aim drag also latches it). */
  setAimLatched(latched: boolean): void {
    this.emitAfter(() => this.machine.setAimLatched(latched));
  }

  /** Local aim elevation (radians) overriding relayed previews; null to use the snapshot/preview. */
  setLocalAim(angle: number | null): void {
    this.localAim = angle;
  }

  /** Remembers the latest relayed aim of a snail. */
  aimPreview(snailId: string, angle: number): void {
    this.previews.set(snailId, angle);
  }

  /** Feeds a snapshot (positions for aim mode, projectiles for auto-follow). */
  onSnapshot(snapshot: GameSnapshot): void {
    this.snapshot = snapshot;
    this.emitAfter(() => this.machine.setProjectileInFlight(snapshot.projectiles.length > 0));
  }

  /** Manual toggle button. */
  cycle(): void {
    this.emitAfter(() => this.machine.cycle());
  }

  /** Applies gesture input; a gesture outside free mode switches to it first. */
  gesture(input: FreeCameraInput): void {
    this.emitAfter(() => this.machine.enterFree());
    this.sync();
    this.drive(input);
  }

  /** Free camera jump to a world position (minimap tap). */
  jumpTo(x: number, z: number): void {
    this.emitAfter(() => this.machine.enterFree());
    this.sync();
    const m = this.mirror;
    if (m) this.drive(inputToward(m, { ...m, target: { x, y: m.target.y, z } }));
  }

  /** Per-frame update (call before the rig updates): syncs the rig mode and steers aim mode. */
  update(): void {
    this.sync();
    if (this.machine.mode !== 'aim' || !this.mirror) return;
    const target = this.aimTarget();
    if (!target) return;
    this.rig.setFreePose(target);
    this.mirror = target;
  }

  private aimTarget(): CameraPose | null {
    const snap = this.snapshot;
    if (!snap) return null;
    const id = snap.turn.activeSnailId;
    for (const team of snap.teams) {
      const s = team.snails.find((x) => x.id === id);
      if (!s) continue;
      const angle = this.localAim ?? this.previews.get(s.id) ?? s.aim?.angle ?? 0;
      return aimPose(s.position, s.facing, angle);
    }
    return null;
  }

  private drive(input: FreeCameraInput): void {
    if (!this.mirror) return;
    this.rig.applyInput(input);
    this.mirror = applyFreeInput(this.mirror, input);
  }

  private sync(): void {
    const mode = this.machine.mode;
    if (mode === this.applied) return;
    this.applied = mode;
    if (mode === 'follow') {
      this.rig.setTarget(null);
      this.rig.setMode('follow');
      this.mirror = null;
    } else {
      this.rig.setMode('free');
      this.mirror ??= this.rig.pose();
    }
  }

  private emitAfter(change: () => ViewCameraMode): void {
    const before = this.machine.mode;
    const after = change();
    if (after !== before) for (const fn of this.listeners) fn(after);
  }
}
