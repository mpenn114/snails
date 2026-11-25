import * as THREE from 'three';
import type { HillState } from '@snails/core';
import type { FrameUpdater } from '../render-loop.js';
import { PALETTE } from '../style/palette.js';

/** Height of the glowing column in metres. */
const COLUMN_HEIGHT = 5;
/** Ground ring lift above the zone centre (avoids z-fighting with terrain). */
const RING_LIFT = 0.06;
/** Seconds-scale pulse of the column opacity. */
const PULSE_RATE = 2;

/**
 * Draws the King of the Hill "Dewdrop Zone": a translucent column and a ground ring in palette
 * colours at `snapshot.hill`. Hidden when the snapshot has no zone. Pure view of the snapshot.
 */
export class HillLayer {
  /** Attach this to `roots.effects`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: syncs from the render state each frame. */
  readonly updater: FrameUpdater;
  private readonly column: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry[];
  private readonly materials: THREE.MeshBasicMaterial[];
  private clock = 0;

  /** Creates a hidden layer. */
  constructor() {
    this.group.name = 'hill';
    this.group.visible = false;
    const colMat = new THREE.MeshBasicMaterial({
      color: PALETTE.waterFoam,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.sunLight,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const colGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
    const ringGeo = new THREE.RingGeometry(0.88, 1, 32).rotateX(-Math.PI / 2);
    this.geometry = [colGeo, ringGeo];
    this.materials = [colMat, ringMat];
    this.column = new THREE.Mesh(colGeo, colMat);
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.group.add(this.column, this.ring);
    this.updater = (dt, state) => {
      this.clock += dt;
      this.sync(state?.snapshot.hill);
    };
  }

  /** Whether the zone is currently shown. */
  get visible(): boolean {
    return this.group.visible;
  }

  /** Places the zone (or hides it when `hill` is undefined). */
  sync(hill: HillState | undefined): void {
    this.group.visible = hill !== undefined;
    if (!hill) return;
    const { x, y, z } = hill.position;
    this.column.position.set(x, y, z);
    this.column.scale.set(hill.radius, COLUMN_HEIGHT, hill.radius);
    this.ring.position.set(x, y + RING_LIFT, z);
    this.ring.scale.set(hill.radius, 1, hill.radius);
    this.materials[0]!.opacity = 0.2 + 0.08 * Math.sin(this.clock * PULSE_RATE);
  }

  /** Frees geometry and materials. */
  dispose(): void {
    for (const g of this.geometry) g.dispose();
    for (const m of this.materials) m.dispose();
    this.group.removeFromParent();
  }
}
