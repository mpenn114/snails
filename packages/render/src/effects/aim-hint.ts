import * as THREE from 'three';
import type { ExtraLayer } from '../match-renderer.js';

/** Live aim relayed by the server for the active snail. */
export interface AimHintInput {
  snailId: string;
  /** Pitch in radians. */
  angle: number;
  /** Power 0..1. */
  power: number;
}

/** Tuning of the hint trajectory (approximate; the server stays authoritative). */
export interface AimHintOptions {
  minSpeed?: number;
  maxSpeed?: number;
  gravity?: number;
  /** Number of trajectory samples (default 24). */
  samples?: number;
  /** Time step between samples in seconds (default 0.08). */
  step?: number;
  /** Line colour (default white). */
  colour?: number;
}

/** A point in metres. */
export interface HintPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Samples the ballistic arc a shot with this aim would follow from `origin`, facing `facing`
 * (radians, as in core: direction `(cos f, 0, -sin f)`). Pure; used for the aim hint line.
 */
export function aimTrajectory(
  origin: HintPoint,
  facing: number,
  aim: Pick<AimHintInput, 'angle' | 'power'>,
  opts: AimHintOptions = {},
): HintPoint[] {
  const { minSpeed = 6, maxSpeed = 24, gravity = 9.81, samples = 24, step = 0.08 } = opts;
  const speed = minSpeed + (maxSpeed - minSpeed) * Math.min(1, Math.max(0, aim.power));
  const h = Math.cos(aim.angle) * speed;
  const vx = Math.cos(facing) * h;
  const vz = -Math.sin(facing) * h;
  const vy = Math.sin(aim.angle) * speed;
  const out: HintPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i * step;
    out.push({
      x: origin.x + vx * t,
      y: origin.y + vy * t - 0.5 * gravity * t * t,
      z: origin.z + vz * t,
    });
  }
  return out;
}

/** Controller of the aim hint layer. */
export interface AimHint {
  /** Layer to pass to `MatchRenderer.addLayer`. */
  layer: ExtraLayer;
  /** Sets the aim to show, or null to hide it. */
  set(aim: AimHintInput | null): void;
  /** Releases GPU resources. */
  dispose(): void;
}

/** Creates the aim hint: a line along the predicted arc of the active snail's shot. */
export function createAimHint(opts: AimHintOptions = {}): AimHint {
  const samples = opts.samples ?? 24;
  const geometry = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(new Float32Array(samples * 3), 3);
  geometry.setAttribute('position', attr);
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({
    color: opts.colour ?? 0xffffff,
    transparent: true,
    opacity: 0.8,
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  line.visible = false;
  const group = new THREE.Group();
  group.name = 'aim-hint';
  group.add(line);
  let aim: AimHintInput | null = null;
  const layer: ExtraLayer = {
    name: 'aim-hint',
    group,
    updater: (_dt, state) => {
      const snail = aim
        ? state?.snapshot.teams.flatMap((t) => t.snails).find((s) => s.id === aim?.snailId)
        : undefined;
      if (!aim || !snail || !snail.alive) {
        line.visible = false;
        return;
      }
      const o = { x: snail.position.x, y: snail.position.y + 0.4, z: snail.position.z };
      const pts = aimTrajectory(o, snail.facing, aim, opts);
      pts.forEach((p, i) => attr.setXYZ(i, p.x, p.y, p.z));
      attr.needsUpdate = true;
      geometry.setDrawRange(0, pts.length);
      line.visible = true;
    },
  };
  return {
    layer,
    set: (a) => {
      aim = a;
      if (!a) line.visible = false;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      group.removeFromParent();
    },
  };
}
