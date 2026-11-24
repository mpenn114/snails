import * as THREE from 'three';
import { PALETTE } from '../style/palette.js';
import { createToonMaterial } from '../style/materials.js';
import type { ShellLook } from './shell-look.js';

/** Attachment names the renderer can draw; unknown names are ignored. */
export const KNOWN_ATTACHMENTS: readonly string[] = ['spikes', 'plates'];

/** Local-space placement of one attachment instance on the shell. */
export interface AttachmentSpot {
  position: [number, number, number];
  /** Rotation about Z tilting the piece so it points away from the shell axis. */
  tilt: number;
}

/** Evenly spaced spots on a ring around the shell's silhouette (shell units, radius `r`). */
export function attachmentSpots(count: number, r: number): AttachmentSpot[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + 0.3;
    return { position: [Math.cos(a) * r, Math.sin(a) * r, 0], tilt: a - Math.PI / 2 };
  });
}

/**
 * Per-snail research decoration parented to the shell mesh: low-poly attachments and a soft
 * additive shimmer/glow shell. Geometry is tiny and owned per instance.
 */
export class ShellExtras {
  /** Attach to the shell mesh. */
  readonly group = new THREE.Group();
  private readonly pieces = new THREE.Group();
  private readonly spikeGeo = new THREE.ConeGeometry(0.1, 0.34, 5);
  private readonly plateGeo = new THREE.BoxGeometry(0.34, 0.1, 0.1);
  private readonly pieceMat = createToonMaterial({ color: PALETTE.rock, flat: true });
  private readonly glowMat = new THREE.MeshBasicMaterial({
    color: PALETTE.uiPaper,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private readonly glowMesh: THREE.Mesh;
  private readonly radius: number;
  private readonly centre = new THREE.Vector3();
  private glowBase = 0;
  private shimmer = false;
  private t = 0;

  /** `shellGeo` is the snail's shell geometry (the glow shell reuses it). */
  constructor(shellGeo: THREE.BufferGeometry) {
    this.glowMesh = new THREE.Mesh(shellGeo, this.glowMat);
    this.glowMesh.scale.setScalar(1.06);
    this.glowMesh.visible = false;
    this.glowMesh.name = 'shell-glow';
    this.group.name = 'shell-extras';
    this.group.add(this.pieces, this.glowMesh);
    shellGeo.computeBoundingBox();
    const box = shellGeo.boundingBox ?? new THREE.Box3();
    this.radius = Math.max(box.max.y - box.min.y, 0.5) * 0.5;
    box.getCenter(this.centre);
  }

  /** Rebuilds attachments and glow for a look. Cheap; call only when the look changed. */
  setLook(look: ShellLook): void {
    this.pieces.clear();
    for (const name of look.attachments.filter((a) => KNOWN_ATTACHMENTS.includes(a))) {
      const spikes = name === 'spikes';
      for (const s of attachmentSpots(spikes ? 6 : 4, this.radius * (spikes ? 0.95 : 0.8))) {
        const m = new THREE.Mesh(spikes ? this.spikeGeo : this.plateGeo, this.pieceMat);
        m.position.set(...s.position).add(this.centre);
        m.rotation.z = s.tilt + (spikes ? 0 : Math.PI / 2);
        this.pieces.add(m);
      }
    }
    this.glowBase = look.glow === null ? 0 : 0.22;
    this.glowMat.color.setHex(look.glow ?? PALETTE.uiPaper);
    this.refresh();
  }

  /** Turns the "researching" shimmer on or off. */
  setShimmer(on: boolean): void {
    if (on === this.shimmer) return;
    this.shimmer = on;
    this.refresh();
  }

  /** Advances the pulse by `dt` seconds. */
  update(dt: number): void {
    this.t += dt;
    if (this.glowMesh.visible) this.glowMat.opacity = this.opacity();
  }

  private opacity(): number {
    return this.glowBase + (this.shimmer ? 0.09 + 0.06 * Math.sin(this.t * 4) : 0);
  }

  private refresh(): void {
    this.glowMesh.visible = this.shimmer || this.glowBase > 0;
    this.glowMat.opacity = this.opacity();
  }

  /** Number of attachment pieces currently shown. */
  get pieceCount(): number {
    return this.pieces.children.length;
  }

  /** Whether the glow/shimmer shell is visible. */
  get glowVisible(): boolean {
    return this.glowMesh.visible;
  }

  /** Frees the per-snail geometry and materials (the shell geometry is shared and kept). */
  dispose(): void {
    this.spikeGeo.dispose();
    this.plateGeo.dispose();
    this.pieceMat.dispose();
    this.glowMat.dispose();
    this.group.removeFromParent();
  }
}
