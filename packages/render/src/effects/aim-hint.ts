import * as THREE from 'three';
import { predictTrajectory, type WeaponLaunchSpec } from '@snails/core';
import type { ExtraLayer } from '../match-renderer.js';
import { PALETTE } from '../style/palette.js';
import { resolveTeamColour } from '../snail-view.js';
import { dotRadius, layoutDots, type DotLayout, type DotPoint } from './aim-dots.js';

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
  /** Number of trajectory samples (default 28). */
  samples?: number;
  /** Simulation steps (core's fixed timestep) between samples (default 5, ~0.083 s). */
  stepsPerSample?: number;
  /** Metres between dots (default 0.8). */
  dotSpacing?: number;
  /**
   * Whether a world point is inside terrain. When given, the arc stops at the first solid point
   * and a landing ring marks it; without it the whole arc shows and there is no ring.
   */
  isSolid?: (p: DotPoint) => boolean;
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

/** Most dots drawn. */
const MAX_DOTS = 96;
/** Dots this close to the snail are skipped. */
const SKIP = 0.9;
/** How fast the dots march along the arc, m/s. */
const MARCH_SPEED = 1.4;

const ACCENT = new THREE.Color(PALETTE.uiAccent);
const PAPER = new THREE.Color(PALETTE.uiPaper);
const tmpMat = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpColor = new THREE.Color();

/** Resources of the dotted arc and landing marker. */
interface Parts {
  group: THREE.Group;
  dots: THREE.InstancedMesh;
  halos: THREE.InstancedMesh;
  ringInk: THREE.Mesh;
  ringTeam: THREE.Mesh;
  disposables: { dispose(): void }[];
}

function buildParts(): Parts {
  const dotGeo = new THREE.IcosahedronGeometry(1, 1);
  const ringGeo = new THREE.RingGeometry(0.72, 1, 32).rotateX(-Math.PI / 2);
  const inkRingGeo = new THREE.RingGeometry(0.62, 1.12, 32).rotateX(-Math.PI / 2);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const haloMat = new THREE.MeshBasicMaterial({
    color: PALETTE.uiInk,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const markMat = (color: number, opacity: number): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const inkMat = markMat(PALETTE.uiInk, 0.6);
  const teamMat = markMat(0xffffff, 1);
  const dots = new THREE.InstancedMesh(dotGeo, dotMat, MAX_DOTS);
  const halos = new THREE.InstancedMesh(dotGeo, haloMat, MAX_DOTS);
  dots.frustumCulled = false;
  halos.frustumCulled = false;
  halos.renderOrder = 10;
  dots.renderOrder = 11;
  dots.setColorAt(0, tmpColor.set(0xffffff));
  const ringInk = new THREE.Mesh(inkRingGeo, inkMat);
  const ringTeam = new THREE.Mesh(ringGeo, teamMat);
  ringInk.renderOrder = 12;
  ringTeam.renderOrder = 13;
  ringInk.visible = false;
  ringTeam.visible = false;
  const group = new THREE.Group();
  group.name = 'aim-hint';
  group.visible = false;
  group.add(halos, dots, ringInk, ringTeam);
  return {
    group,
    dots,
    halos,
    ringInk,
    ringTeam,
    disposables: [dotGeo, ringGeo, inkRingGeo, dotMat, haloMat, inkMat, teamMat],
  };
}

function writeDots(parts: Parts, layout: DotLayout, buf: Float32Array): void {
  const { dots, halos } = parts;
  for (let i = 0; i < MAX_DOTS; i++) {
    const live = i < layout.count;
    const k = i * 4;
    const u = live ? (buf[k + 3] ?? 0) : 0;
    const r = live ? dotRadius(u) : 0;
    tmpPos.set(buf[k] ?? 0, buf[k + 1] ?? 0, buf[k + 2] ?? 0);
    tmpScale.set(r, r, r);
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    dots.setMatrixAt(i, tmpMat);
    tmpScale.set(r * 1.45, r * 1.45, r * 1.45);
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    halos.setMatrixAt(i, tmpMat);
    dots.setColorAt(i, tmpColor.lerpColors(ACCENT, PAPER, Math.min(1, u * 1.6)));
  }
  dots.instanceMatrix.needsUpdate = true;
  halos.instanceMatrix.needsUpdate = true;
  if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
}

/**
 * Creates the aim hint: a marching dotted arc (accent to paper, ink halo) along the predicted
 * path of the active snail's shot, ending in a team-coloured landing ring where it meets terrain.
 */
export function createAimHint(opts: AimHintOptions = {}): AimHint {
  const samples = opts.samples ?? 28;
  const spacing = opts.dotSpacing ?? 1;
  const parts = buildParts();
  const buf = new Float32Array(MAX_DOTS * 4);
  let aim: AimHintInput | null = null;
  let time = 0;
  const layer: ExtraLayer = {
    name: 'aim-hint',
    group: parts.group,
    updater: (dt, state) => {
      time += dt;
      const team = aim
        ? state?.snapshot.teams.find((t) => t.snails.some((s) => s.id === aim?.snailId))
        : undefined;
      const snail = team?.snails.find((s) => s.id === aim?.snailId);
      const launch = aim?.launch;
      if (!aim || !state || !team || !snail || !snail.alive || !launch) {
        parts.group.visible = false;
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
      const phase = (time * MARCH_SPEED) % spacing;
      const layout = layoutDots(pts, spacing, phase, SKIP, MAX_DOTS, buf, opts.isSolid);
      writeDots(parts, layout, buf);
      const index = state.snapshot.teams.indexOf(team);
      placeMarker(parts, layout, resolveTeamColour(team.colour, index), time);
      parts.group.visible = layout.count > 0;
    },
  };
  return {
    layer,
    set: (a) => {
      aim = a;
      if (!a) parts.group.visible = false;
    },
    dispose: () => {
      for (const d of parts.disposables) d.dispose();
      parts.dots.dispose();
      parts.halos.dispose();
      parts.group.removeFromParent();
    },
  };
}

function placeMarker(parts: Parts, layout: DotLayout, colour: number, time: number): void {
  const at = layout.impact;
  parts.ringInk.visible = !!at;
  parts.ringTeam.visible = !!at;
  if (!at) return;
  const pulse = 0.9 + 0.1 * Math.sin(time * 5);
  const size = 0.9 * pulse;
  for (const m of [parts.ringInk, parts.ringTeam]) {
    m.position.set(at.x, at.y + 0.1, at.z);
    m.scale.set(size, 1, size);
  }
  (parts.ringTeam.material as THREE.MeshBasicMaterial).color.setHex(colour);
}
