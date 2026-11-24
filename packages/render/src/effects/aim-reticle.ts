import * as THREE from 'three';
import type { ExtraLayer } from '../match-renderer.js';
import { PALETTE } from '../style/palette.js';

/** A point in metres. */
export interface ReticlePoint {
  x: number;
  y: number;
  z: number;
}

/** Where the reticle sits: `range` metres from `origin` along the aim direction. */
export interface ReticleAim {
  snailId: string;
  /** Weapon elevation in radians above the facing direction. */
  angle: number;
}

/** Options of the aim reticle. */
export interface AimReticleOptions {
  /** Camera the reticle faces and is sized against; null hides it. */
  getCamera: () => THREE.Camera | null;
  /** Distance from the snail to the reticle (metres, default 14). */
  range?: number;
  /** Apparent size as a fraction of the view distance (default 0.05). */
  screenScale?: number;
  /** Height of the aim ray's origin above the snail (default 0.95); match the aim camera's eye. */
  eyeHeight?: number;
  /** How far behind the snail along its facing the ray starts (default 0). */
  eyeBack?: number;
}

/** Controller of the aim reticle layer. */
export interface AimReticle {
  /** Layer to pass to `MatchRenderer.addLayer`. */
  layer: ExtraLayer;
  /** Sets the aim to mark, or null to hide the reticle. */
  set(aim: ReticleAim | null): void;
  /** Releases GPU resources. */
  dispose(): void;
}

/**
 * World point `range` metres from `origin` along the aim direction (core convention: facing
 * `(cos f, -sin f)` in x/z, positive angle aims up). Pure.
 */
export function reticlePoint(
  origin: ReticlePoint,
  facing: number,
  angle: number,
  range: number,
): ReticlePoint {
  const flat = Math.cos(angle) * range;
  return {
    x: origin.x + Math.cos(facing) * flat,
    y: origin.y + Math.sin(angle) * range,
    z: origin.z - Math.sin(facing) * flat,
  };
}

/** Default offset above the snail position the aim direction starts from. */
const DEFAULT_EYE_HEIGHT = 0.95;

function mark(geo: THREE.BufferGeometry, color: number, order: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = order;
  return m;
}

/** Builds the reticle: an ink-outlined accent ring with a centre dot and four ticks. */
function buildReticle(): { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group();
  group.name = 'aim-reticle';
  group.visible = false;
  const geos: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, color: number, order: number): THREE.Mesh => {
    geos.push(geo);
    const m = mark(geo, color, order);
    group.add(m);
    return m;
  };
  add(new THREE.RingGeometry(0.62, 1.2, 40), PALETTE.uiInk, 20);
  add(new THREE.RingGeometry(0.75, 1.0, 40), PALETTE.uiAccent, 21);
  add(new THREE.CircleGeometry(0.24, 20), PALETTE.uiInk, 20);
  add(new THREE.CircleGeometry(0.15, 20), PALETTE.uiAccent, 21);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    for (const [w, h, color, order] of [
      [0.34, 0.62, PALETTE.uiInk, 20],
      [0.2, 0.5, PALETTE.uiAccent, 21],
    ] as const) {
      const tick = add(new THREE.PlaneGeometry(w, h), color, order);
      const r = 1.3 + h / 2 - (color === PALETTE.uiInk ? 0.1 : 0);
      tick.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      tick.rotation.z = a - Math.PI / 2;
    }
  }
  return {
    group,
    dispose: () => {
      for (const g of geos) g.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
      });
      group.removeFromParent();
    },
  };
}

/**
 * Creates the aim reticle: a camera-facing, constant-size crosshair floating `range` metres
 * ahead of the active snail's eye along its aim direction, in the UI accent colour with an ink
 * outline. Pure view; shows nothing until `set` is given an aim.
 */
export function createAimReticle(opts: AimReticleOptions): AimReticle {
  const { group, dispose } = buildReticle();
  const range = opts.range ?? 14;
  const scale = opts.screenScale ?? 0.05;
  const eyeHeight = opts.eyeHeight ?? DEFAULT_EYE_HEIGHT;
  const eyeBack = opts.eyeBack ?? 0;
  let aim: ReticleAim | null = null;
  const layer: ExtraLayer = {
    name: 'aim-reticle',
    group,
    updater: (_dt, state) => {
      const camera = opts.getCamera();
      const snail = aim
        ? state?.snapshot.teams.flatMap((t) => t.snails).find((s) => s.id === aim?.snailId)
        : undefined;
      if (!aim || !camera || !snail || !snail.alive) {
        group.visible = false;
        return;
      }
      const eye = {
        x: snail.position.x - Math.cos(snail.facing) * eyeBack,
        y: snail.position.y + eyeHeight,
        z: snail.position.z + Math.sin(snail.facing) * eyeBack,
      };
      const p = reticlePoint(eye, snail.facing, aim.angle, range);
      group.position.set(p.x, p.y, p.z);
      group.quaternion.copy(camera.quaternion);
      group.scale.setScalar(Math.max(0.2, camera.position.distanceTo(group.position) * scale));
      group.visible = true;
    },
  };
  return {
    layer,
    set: (a) => {
      aim = a;
      if (!a) group.visible = false;
    },
    dispose,
  };
}
