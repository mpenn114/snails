import * as THREE from 'three';
import type { GameSnapshot } from '@snails/core';
import type { FrameUpdater, RenderState } from '../render-loop.js';
import {
  boundsFromTerrain,
  clampPoint,
  clampPose,
  clonePose,
  poseToPosition,
  yawBehindFacing,
  type CameraPose,
  type Point3,
  type PoseLimits,
  type WorldBounds,
} from './camera-pose.js';
import { clamp, dampStep, unwrapAngle, type DampState } from './damping.js';
import { FollowTracker } from './follow-tracker.js';

/** Camera behaviour. */
export type CameraMode = 'follow' | 'free' | 'cinematic';

/** Scripted shot for cinematic mode. */
export type CinematicShot =
  | { kind: 'orbit'; center: Point3; distance: number; pitch: number; rate: number }
  | {
      kind: 'overview';
      rate: number;
      /** Horizontal span (m) to fit; default: the bounds. */ extent?: number;
    };

/** Input deltas for free mode (already scaled by the caller: radians, metres, log-zoom). */
export interface FreeCameraInput {
  /** x = yaw delta, y = pitch delta (radians). */
  orbitDelta?: { x: number; y: number };
  /** x = right, y = forward along the ground (metres). */
  panDelta?: { x: number; y: number };
  /** Positive zooms out; distance is scaled by exp(zoomDelta). */
  zoomDelta?: number;
}

/** Rig configuration; every field is optional. */
export interface CameraRigOptions {
  mode?: CameraMode;
  /** World bounds the camera must stay inside; derived from the terrain when omitted. */
  bounds?: WorldBounds;
  limits?: Partial<PoseLimits>;
  /** Third-person follow distance and pitch. */
  followDistance?: number;
  followPitch?: number;
  /** Radians added to the behind-the-snail follow yaw (three-quarter view); 0 sits directly behind. */
  followYawOffset?: number;
  /** Smoothing times in seconds. */
  followSmoothTime?: number;
  freeSmoothTime?: number;
  cinematicSmoothTime?: number;
  /** Smoothing time while blending between modes, and how long that lasts. */
  transitionSmoothTime?: number;
  transitionDuration?: number;
  /** Seconds the follow camera lingers on an explosion. */
  explosionHold?: number;
  /** Minimum camera height above the ground returned by `heightAt`. */
  groundClearance?: number;
  /** Optional ground height query (x, z) -> y; keeps the camera above terrain. */
  heightAt?: (x: number, z: number) => number;
  /** Shot used when entering cinematic mode. */
  shot?: CinematicShot;
}

const DEFAULT_LIMITS: PoseLimits = {
  minPitch: 0.1,
  maxPitch: 1.45,
  minDistance: 3,
  maxDistance: 400,
};

type Axis = 'tx' | 'ty' | 'tz' | 'yaw' | 'pitch' | 'dist';
const AXES: readonly Axis[] = ['tx', 'ty', 'tz', 'yaw', 'pitch', 'dist'];

/**
 * Drives a PerspectiveCamera through follow, free and cinematic modes with critically-damped
 * smoothing. Holds no DOM listeners; feed free-mode input through `applyInput`.
 */
export class CameraRig {
  private currentMode: CameraMode;
  private readonly springs: Record<Axis, DampState> = {
    tx: { value: 0, velocity: 0 },
    ty: { value: 0, velocity: 0 },
    tz: { value: 0, velocity: 0 },
    yaw: { value: 0, velocity: 0 },
    pitch: { value: 0.6, velocity: 0 },
    dist: { value: 20, velocity: 0 },
  };
  private readonly limits: PoseLimits;
  private readonly tracker: FollowTracker;
  private bounds: WorldBounds | null;
  private manualTarget: Point3 | null = null;
  private freePose: CameraPose;
  private shot: CinematicShot;
  private shotYaw = 0;
  private transitionLeft = 0;
  private needsSnap = true;
  private lastSnapshot: GameSnapshot | null = null;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly opts: CameraRigOptions = {},
  ) {
    this.currentMode = opts.mode ?? 'follow';
    this.limits = { ...DEFAULT_LIMITS, ...opts.limits };
    this.bounds = opts.bounds ?? null;
    this.shot = opts.shot ?? { kind: 'overview', rate: 0.08 };
    this.tracker = new FollowTracker({
      explosionHold: opts.explosionHold ?? 1.5,
      snailLookHeight: 0.8,
    });
    this.freePose = this.pose();
  }

  /** Current mode. */
  get mode(): CameraMode {
    return this.currentMode;
  }

  /** Switches mode; the camera blends smoothly from where it is. */
  setMode(mode: CameraMode): void {
    if (mode === this.currentMode) return;
    this.currentMode = mode;
    this.transitionLeft = this.opts.transitionDuration ?? 0.8;
    if (mode === 'free') this.freePose = this.pose();
    if (mode === 'cinematic') this.shotYaw = this.springs.yaw.value;
  }

  /** Overrides the follow target with a fixed point; null restores automatic tracking. */
  setTarget(target: Point3 | null): void {
    this.manualTarget = target ? { ...target } : null;
  }

  /** Selects the cinematic shot (takes effect immediately in cinematic mode). */
  setShot(shot: CinematicShot): void {
    this.shot = shot;
    this.shotYaw = this.springs.yaw.value;
  }

  /** Current smoothed pose (a copy). */
  pose(): CameraPose {
    const s = this.springs;
    return {
      target: { x: s.tx.value, y: s.ty.value, z: s.tz.value },
      yaw: s.yaw.value,
      pitch: s.pitch.value,
      distance: s.dist.value,
    };
  }

  /** Jumps to the desired pose on the next update, with no smoothing. */
  snap(): void {
    this.needsSnap = true;
  }

  /** Applies free-mode input; ignored in other modes. */
  applyInput(input: FreeCameraInput): void {
    if (this.currentMode !== 'free') return;
    const p = this.freePose;
    if (input.orbitDelta) {
      p.yaw += input.orbitDelta.x;
      p.pitch += input.orbitDelta.y;
    }
    if (input.panDelta) {
      const right = { x: -Math.sin(p.yaw), z: Math.cos(p.yaw) };
      const fwd = { x: -Math.cos(p.yaw), z: -Math.sin(p.yaw) };
      p.target.x += right.x * input.panDelta.x + fwd.x * input.panDelta.y;
      p.target.z += right.z * input.panDelta.x + fwd.z * input.panDelta.y;
    }
    if (input.zoomDelta) p.distance *= Math.exp(input.zoomDelta);
    clampPose(p, this.limits);
    if (this.bounds) clampPoint(p.target, this.bounds);
  }

  /** Per-frame update for the render loop. */
  readonly updater: FrameUpdater = (dt, state) => this.update(dt, state);

  /** Advances the rig by `dt` seconds and writes the camera transform. */
  update(dt: number, state: RenderState | null): void {
    const snapshot = state?.snapshot ?? this.lastSnapshot;
    this.lastSnapshot = snapshot;
    if (snapshot && !this.bounds) this.bounds = boundsFromTerrain(snapshot.terrain, 20);
    const desired = this.desiredPose(dt, snapshot);
    clampPose(desired, this.limits);
    this.advanceSprings(desired, dt);
    this.transitionLeft = Math.max(0, this.transitionLeft - dt);
    this.applyToCamera();
  }

  private smoothTime(): number {
    const o = this.opts;
    if (this.transitionLeft > 0) return o.transitionSmoothTime ?? 0.6;
    if (this.currentMode === 'free') return o.freeSmoothTime ?? 0.12;
    if (this.currentMode === 'cinematic') return o.cinematicSmoothTime ?? 0.8;
    return o.followSmoothTime ?? 0.35;
  }

  private desiredPose(dt: number, snapshot: GameSnapshot | null): CameraPose {
    if (this.currentMode === 'free') return clonePose(this.freePose);
    if (this.currentMode === 'cinematic') return this.cinematicPose(dt);
    return this.followPose(dt, snapshot);
  }

  private followPose(dt: number, snapshot: GameSnapshot | null): CameraPose {
    const cur = this.pose();
    const focus = this.tracker.update(dt, snapshot);
    const target = this.manualTarget ?? focus?.point ?? cur.target;
    const yaw =
      !this.manualTarget && focus?.facing != null
        ? yawBehindFacing(focus.facing) + (this.opts.followYawOffset ?? 0)
        : cur.yaw;
    return {
      target: { ...target },
      yaw,
      pitch: this.opts.followPitch ?? 0.45,
      distance: this.opts.followDistance ?? 9,
    };
  }

  private cinematicPose(dt: number): CameraPose {
    this.shotYaw += this.shot.rate * dt;
    const b = this.bounds;
    if (this.shot.kind === 'orbit') {
      return {
        target: { ...this.shot.center },
        yaw: this.shotYaw,
        pitch: this.shot.pitch,
        distance: this.shot.distance,
      };
    }
    const min = b?.min ?? { x: -50, y: 0, z: -50 };
    const max = b?.max ?? { x: 50, y: 40, z: 50 };
    const extent = this.shot.extent ?? Math.max(max.x - min.x, max.z - min.z);
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    return {
      target: { x: (min.x + max.x) / 2, y: min.y + (max.y - min.y) * 0.25, z: (min.z + max.z) / 2 },
      yaw: this.shotYaw,
      pitch: 0.65,
      distance: (extent * 0.6) / Math.tan(halfFov),
    };
  }

  private advanceSprings(desired: CameraPose, dt: number): void {
    const s = this.springs;
    const goal: Record<Axis, number> = {
      tx: desired.target.x,
      ty: desired.target.y,
      tz: desired.target.z,
      yaw: unwrapAngle(desired.yaw, s.yaw.value),
      pitch: desired.pitch,
      dist: desired.distance,
    };
    if (this.needsSnap) {
      this.needsSnap = false;
      for (const a of AXES) s[a] = { value: goal[a], velocity: 0 };
      return;
    }
    const t = this.smoothTime();
    for (const a of AXES) dampStep(s[a], goal[a], t, clamp(dt, 0, 0.25));
  }

  private applyToCamera(): void {
    const pose = this.pose();
    clampPose(pose, this.limits);
    const pos = poseToPosition(pose);
    if (this.bounds) clampPoint(pos, this.bounds);
    const { heightAt, groundClearance } = this.opts;
    if (heightAt) pos.y = Math.max(pos.y, heightAt(pos.x, pos.z) + (groundClearance ?? 1));
    this.camera.position.set(pos.x, pos.y, pos.z);
    this.camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  }
}
