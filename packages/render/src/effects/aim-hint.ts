import * as THREE from 'three';
import { predictTrajectory, type WeaponLaunchSpec } from '@snails/core';
import type { ExtraLayer } from '../match-renderer.js';

/** Live aim relayed by the server for the active snail. */
export interface AimHintInput {
  snailId: string;
  /** Launch parameters of the snail's selected weapon, as relayed by the server. */
  launch?: WeaponLaunchSpec;
  /** Pitch in radians. */
  angle: number;
  /** Power 0..1. */
  power: number;
}

/** Tuning of the hint trajectory. */
export interface AimHintOptions {
  /** Number of trajectory samples (default 24). */
  samples?: number;
  /** Simulation steps (core's fixed timestep) between samples (default 5, ~0.083 s). */
  stepsPerSample?: number;
  /** Line colour (default white). */
  colour?: number;
}

/** A point in metres. */
export interface HintPoint {
  x: number;
  y: number;
  z: number;
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
      const launch = aim?.launch;
      if (!aim || !state || !snail || !snail.alive || !launch) {
        line.visible = false;
        return;
      }
      const pts = predictTrajectory(
        snail.position,
        snail.facing,
        aim,
        launch,
        state.snapshot.wind,
        samples,
        opts.stepsPerSample,
      );
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
