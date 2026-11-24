import * as THREE from 'three';
import type { ScheduledEffect } from '@snails/core';
import type { FrameUpdater } from '../render-loop.js';
import { PALETTE } from '../style/palette.js';

/** Ground lift so rings do not z-fight with terrain. */
const LIFT = 0.06;
/** Height of the vertical warning beam, metres, so side-on cameras see the marker. */
const BEAM_HEIGHT = 7;
const PULSE_RATE = 3.2;

/** One telegraph: ground ring, soft beam and (arrival) a landing disc. */
interface Marker {
  readonly group: THREE.Group;
  readonly ring: THREE.Mesh;
  readonly beam: THREE.Mesh;
  readonly disc: THREE.Mesh;
}

/**
 * Warning markers for `GameState.scheduled` (Beetle Barrage shells, the Snail Mail arrival): a
 * pulsing ground ring in the palette accent colour with a translucent beam above it, plus a
 * line along the ground between the ends of a multi-shell group. Pure view: positions, radii
 * and styles come from the snapshot; the sim decides when the strike lands.
 */
export class ScheduledLayer {
  /** Attach this to `roots.effects`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: syncs from the render state each frame. */
  readonly updater: FrameUpdater;
  private readonly markers = new Map<string, Marker>();
  private readonly lines = new Map<string, THREE.Mesh>();
  private readonly ringGeo = new THREE.RingGeometry(0.82, 1, 24).rotateX(-Math.PI / 2);
  private readonly discGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  private readonly beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0);
  private readonly lineGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly ringMat = this.material(PALETTE.uiAccent, 0.95);
  private readonly discMat = this.material(PALETTE.uiAccent, 0.3);
  private readonly beamMat = this.material(PALETTE.uiAccent, 0.16);
  private clock = 0;

  /** Creates an empty layer. */
  constructor() {
    this.group.name = 'scheduled';
    this.updater = (dt, state) => {
      this.clock += dt;
      if (state) this.sync(state.snapshot.scheduled ?? []);
    };
  }

  /** Number of live markers. */
  get size(): number {
    return this.markers.size;
  }

  private material(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  private create(): Marker {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    const disc = new THREE.Mesh(this.discGeo, this.discMat);
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
    group.add(disc, ring, beam);
    this.group.add(group);
    return { group, ring, beam, disc };
  }

  /** Creates, places and removes markers (and group lines) to match `scheduled` by id. */
  sync(scheduled: readonly ScheduledEffect[]): void {
    const seen = new Set<string>();
    const pulse = 1 + 0.06 * Math.sin(this.clock * PULSE_RATE);
    for (const s of scheduled) {
      seen.add(s.id);
      let m = this.markers.get(s.id);
      if (!m) {
        m = this.create();
        this.markers.set(s.id, m);
      }
      const r = Math.max(0.1, s.telegraph.radius);
      m.group.position.set(s.position.x, s.position.y + LIFT, s.position.z);
      m.ring.scale.setScalar(r * pulse);
      m.disc.scale.setScalar(r);
      m.disc.visible = s.telegraph.style === 'arrival';
      m.beam.scale.set(r * 0.5, BEAM_HEIGHT, r * 0.5);
    }
    this.removeStale(this.markers, seen, (m) => m.group);
    this.syncLines(scheduled);
  }

  private syncLines(scheduled: readonly ScheduledEffect[]): void {
    const groups = new Map<string, ScheduledEffect[]>();
    for (const s of scheduled) groups.set(s.groupId, [...(groups.get(s.groupId) ?? []), s]);
    const seen = new Set<string>();
    for (const [id, members] of groups) {
      if (members.length < 2) continue;
      seen.add(id);
      let line = this.lines.get(id);
      if (!line) {
        line = new THREE.Mesh(this.lineGeo, this.ringMat);
        this.lines.set(id, line);
        this.group.add(line);
      }
      const xs = members.map((m) => m.position.x);
      const a = Math.min(...xs);
      const b = Math.max(...xs);
      const first = members[0] as ScheduledEffect;
      line.position.set((a + b) / 2, first.position.y + LIFT, first.position.z);
      line.scale.set(Math.max(0.1, b - a), 0.05, 0.12);
    }
    this.removeStale(this.lines, seen, (l) => l);
  }

  private removeStale<T>(
    map: Map<string, T>,
    seen: ReadonlySet<string>,
    object: (v: T) => THREE.Object3D,
  ): void {
    for (const [id, v] of map) {
      if (seen.has(id)) continue;
      object(v).removeFromParent();
      map.delete(id);
    }
  }

  /** Removes all markers and frees the shared geometry and materials. */
  dispose(): void {
    this.markers.clear();
    this.lines.clear();
    for (const g of [this.ringGeo, this.discGeo, this.beamGeo, this.lineGeo]) g.dispose();
    for (const m of [this.ringMat, this.discMat, this.beamMat]) m.dispose();
    this.group.removeFromParent();
  }
}
