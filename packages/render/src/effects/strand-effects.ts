import * as THREE from 'three';
import type { SimEvent } from '@snails/core';
import type { FrameUpdater, RenderState } from '../render-loop.js';
import { PALETTE } from '../style/palette.js';

/** Slime green, matching the goo splat. */
const SLIME_COLOUR = 0x9bdc3c;
/** Strand thickness (radius, metres) and the anchor blob radius. */
const STRAND_RADIUS = 0.07;
const BLOB_RADIUS = 0.2;
/** Height above the snail's centre where the strand leaves the body. */
const MOUTH_LIFT = 0.15;
/** A strand without a `ropeReleased` event is dropped this long after the reel should end. */
const STRAND_GRACE = 0.6;
/** Bash puff: pooled spheres, lifetime in seconds, count per strike. */
const PUFF_POOL = 36;
const PUFF_LIFE = 0.45;
const PUFF_PER_STRIKE = 7;

interface Strand {
  snailId: string;
  anchor: THREE.Vector3;
  age: number;
  seconds: number;
  strand: THREE.Mesh;
  blob: THREE.Mesh;
}

interface Puff {
  mesh: THREE.Mesh;
  age: number;
  vel: THREE.Vector3;
  size: number;
}

export interface StrandEffectsOptions {
  /** Random source for puff scatter (default `Math.random`). */
  random?: () => number;
  /** Particle scale of the quality tier (scales the puff count). */
  quality?: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();
const tmpFrom = new THREE.Vector3();

/**
 * Slime Rope strand and Shell Bash puff. On `ropeAttached` a thin green strand is stretched
 * from the roped snail to its anchor every frame (the snail position comes from the snapshot),
 * until `ropeReleased`. On `meleeStruck` a small burst of paper-white puffs flies out of the
 * strike point. Pure view: shared geometry and materials, no rules.
 */
export class StrandEffects {
  /** Attach this to `roots.effects`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater. */
  readonly updater: FrameUpdater;
  private readonly strands = new Map<string, Strand>();
  private readonly puffs: Puff[] = [];
  private readonly strandGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  private readonly blobGeo = new THREE.IcosahedronGeometry(1, 0);
  private readonly slimeMat = new THREE.MeshLambertMaterial({ color: SLIME_COLOUR });
  private readonly puffMat = new THREE.MeshBasicMaterial({ color: PALETTE.uiPaper });
  private readonly random: () => number;
  private readonly perStrike: number;
  private nextPuff = 0;

  /** Creates the layer with its puff pool (all hidden). */
  constructor(opts: StrandEffectsOptions = {}) {
    this.random = opts.random ?? Math.random;
    this.perStrike = Math.max(2, Math.round(PUFF_PER_STRIKE * Math.min(1, opts.quality ?? 1)));
    this.group.name = 'strands';
    for (let i = 0; i < PUFF_POOL; i++) {
      const mesh = new THREE.Mesh(this.blobGeo, this.puffMat);
      mesh.visible = false;
      this.group.add(mesh);
      this.puffs.push({ mesh, age: PUFF_LIFE, vel: new THREE.Vector3(), size: 0.1 });
    }
    this.updater = (dt, state) => {
      this.advancePuffs(dt);
      this.syncStrands(dt, state);
    };
  }

  /** Number of strands currently drawn. */
  get activeStrands(): number {
    return this.strands.size;
  }

  /** Number of puffs currently animating. */
  get activePuffs(): number {
    return this.puffs.filter((p) => p.mesh.visible).length;
  }

  /** Reacts to `ropeAttached`, `ropeReleased` and `meleeStruck`. */
  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'ropeAttached') this.attach(e.snailId, e.anchor, e.seconds);
      else if (e.type === 'ropeReleased') this.release(e.snailId);
      else if (e.type === 'meleeStruck') this.burst(e.position);
    }
  }

  private attach(snailId: string, anchor: { x: number; y: number; z: number }, seconds: number) {
    this.release(snailId);
    const strand = new THREE.Mesh(this.strandGeo, this.slimeMat);
    const blob = new THREE.Mesh(this.blobGeo, this.slimeMat);
    blob.scale.setScalar(BLOB_RADIUS);
    blob.position.set(anchor.x, anchor.y, anchor.z);
    strand.visible = false;
    this.group.add(strand, blob);
    this.strands.set(snailId, {
      snailId,
      anchor: new THREE.Vector3(anchor.x, anchor.y, anchor.z),
      age: 0,
      seconds,
      strand,
      blob,
    });
  }

  private release(snailId: string): void {
    const s = this.strands.get(snailId);
    if (!s) return;
    s.strand.removeFromParent();
    s.blob.removeFromParent();
    this.strands.delete(snailId);
  }

  private burst(at: { x: number; y: number; z: number }): void {
    const r = this.random;
    for (let i = 0; i < this.perStrike; i++) {
      const p = this.puffs[this.nextPuff];
      this.nextPuff = (this.nextPuff + 1) % this.puffs.length;
      if (!p) return;
      const a = r() * Math.PI * 2;
      const speed = 1.2 + 1.6 * r();
      p.age = 0;
      p.size = 0.12 + 0.14 * r();
      p.vel.set(Math.cos(a) * speed, 0.6 + 1.2 * r(), Math.sin(a) * speed);
      p.mesh.position.set(at.x, at.y + 0.1, at.z);
      p.mesh.scale.setScalar(p.size);
      p.mesh.visible = true;
    }
  }

  private advancePuffs(dt: number): void {
    for (const p of this.puffs) {
      if (!p.mesh.visible) continue;
      p.age += dt;
      if (p.age >= PUFF_LIFE) {
        p.mesh.visible = false;
        continue;
      }
      p.vel.multiplyScalar(Math.max(0, 1 - 4 * dt));
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.setScalar(p.size * (1 - p.age / PUFF_LIFE));
    }
  }

  private syncStrands(dt: number, state: RenderState | null): void {
    for (const s of [...this.strands.values()]) {
      s.age += dt;
      if (s.age > s.seconds + STRAND_GRACE) {
        this.release(s.snailId);
        continue;
      }
      const snail = state?.snapshot.teams.flatMap((t) => t.snails).find((x) => x.id === s.snailId);
      if (!snail) {
        s.strand.visible = false;
        continue;
      }
      tmpFrom.set(snail.position.x, snail.position.y + MOUTH_LIFT, snail.position.z);
      tmpDir.copy(s.anchor).sub(tmpFrom);
      const length = tmpDir.length();
      s.strand.visible = length > 0.05;
      if (!s.strand.visible) continue;
      tmpDir.multiplyScalar(1 / length);
      s.strand.position.copy(tmpFrom).addScaledVector(tmpDir, length / 2);
      s.strand.quaternion.setFromUnitVectors(UP, tmpDir);
      s.strand.scale.set(STRAND_RADIUS, length, STRAND_RADIUS);
    }
  }

  /** Frees GPU resources and detaches from the scene. */
  dispose(): void {
    for (const id of [...this.strands.keys()]) this.release(id);
    this.strandGeo.dispose();
    this.blobGeo.dispose();
    this.slimeMat.dispose();
    this.puffMat.dispose();
    this.group.removeFromParent();
  }
}
