import * as THREE from 'three';
import type { ShellDecalSpot } from '../snail/shell-geometry.js';
import { PALETTE } from '../style/palette.js';
import { createToonMaterial } from '../style/materials.js';
import type { ShellLook } from './shell-look.js';
import {
  ATTACHMENT_REGISTRY,
  attachmentDef,
  attachmentGeometry,
  decalGeometry,
  decalIndexForTeam,
} from './shell-attachments.js';

/** Attachment names the renderer can draw; unknown names are ignored. */
export const KNOWN_ATTACHMENTS: readonly string[] = Object.keys(ATTACHMENT_REGISTRY);

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
 * additive shimmer/glow shell. Piece geometry is shared (see shell-attachments).
 */
export class ShellExtras {
  /** Attach to the shell mesh. */
  readonly group = new THREE.Group();
  private readonly pieces = new THREE.Group();
  private readonly decal = new THREE.Group();
  private readonly decalMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  private readonly decalRim = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  private lookNames: string[] = [];
  private detail = true;
  private flag = false;
  private decalKey = '';
  private zMax = 0;
  private readonly spot: ShellDecalSpot | null;
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
    this.group.add(this.pieces, this.decal, this.glowMesh);
    shellGeo.computeBoundingBox();
    const box = shellGeo.boundingBox ?? new THREE.Box3();
    this.radius = Math.max(box.max.y - box.min.y, 0.5) * 0.5;
    box.getCenter(this.centre);
    this.zMax = box.max.z;
    this.spot = (shellGeo.userData.decal as ShellDecalSpot | undefined) ?? null;
  }

  /** Rebuilds attachments and glow for a look. Cheap; call only when the look changed. */
  setLook(look: ShellLook): void {
    this.lookNames = look.attachments;
    this.rebuildPieces();
    this.glowBase = look.glow === null ? 0 : 0.22;
    this.glowMat.color.setHex(look.glow ?? PALETTE.uiPaper);
    this.refresh();
  }

  /**
   * Shows the team decal (emblem on the last whorl, lighter tint of the team colour, shape from
   * {@link decalIndexForTeam}); pass null to hide it. Doubles as a colour-blind cue.
   */
  setTeam(teamIndex: number | null, colour: number = PALETTE.uiPaper): void {
    const key = teamIndex === null ? '' : `${teamIndex}|${colour}`;
    if (key === this.decalKey) return;
    this.decalKey = key;
    this.decal.clear();
    if (teamIndex === null) return;
    this.decalMat.color.setHex(colour).lerp(new THREE.Color(0xffffff), 0.5);
    this.decalRim.color.setHex(colour).lerp(new THREE.Color(0x000000), 0.45);
    const idx = decalIndexForTeam(teamIndex);
    const m = new THREE.Group();
    const rim = new THREE.Mesh(decalGeometry(idx, 1), this.decalRim);
    const fill = new THREE.Mesh(decalGeometry(idx, 0.74), this.decalMat);
    fill.position.z = 0.04;
    m.add(rim, fill);
    const spot = this.spot;
    if (spot) {
      // Lie flat on the last whorl: face along the surface normal, emblem "up" towards +Y.
      const n = new THREE.Vector3(...spot.normal);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const want = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
      const roll = Math.atan2(up.clone().cross(want).dot(n), up.dot(want));
      m.quaternion
        .copy(q)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
      m.position.set(...spot.position);
      m.scale.setScalar(this.radius * 0.21);
    } else {
      m.position.copy(this.centre).setZ(this.zMax + 0.01);
      m.scale.setScalar(this.radius * 0.28);
    }
    this.decal.add(m);
  }

  /** Shows a small flag on the active snail (state-driven, not a tech attachment). */
  setFlag(on: boolean): void {
    if (on === this.flag) return;
    this.flag = on;
    this.rebuildPieces();
  }

  /** Low tiers pass false to cull attachments and the decal (glow stays). */
  setDetail(on: boolean): void {
    this.detail = on;
    this.pieces.visible = on;
    this.decal.visible = on;
  }

  /** Whether attachments and decal are drawn. */
  get detailVisible(): boolean {
    return this.detail;
  }

  private rebuildPieces(): void {
    this.pieces.clear();
    const names = this.flag ? [...this.lookNames, 'flag'] : this.lookNames;
    const seen = new Set<string>();
    for (const name of names) {
      const def = attachmentDef(name);
      if (!def || seen.has(def.kind)) continue;
      seen.add(def.kind);
      const r = this.radius * def.radius;
      const spots =
        def.count === 1
          ? [{ position: [0, r, 0] as [number, number, number], tilt: 0 }]
          : attachmentSpots(def.count, r);
      for (const s of spots) {
        const m = new THREE.Mesh(attachmentGeometry(def.kind), this.pieceMat);
        m.position.set(...s.position).add(this.centre);
        m.rotation.z = s.tilt + def.extraTilt;
        this.pieces.add(m);
      }
    }
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
    this.decalMat.dispose();
    this.decalRim.dispose();
    this.pieceMat.dispose();
    this.glowMat.dispose();
    this.group.removeFromParent();
  }
}
