import * as THREE from 'three';
import type { FrameUpdater, RenderState } from '../render-loop.js';
import { PALETTE } from '../style/palette.js';
import { createToonMaterial } from '../style/materials.js';
import { debrisScale } from './blast-params.js';
import { emitChunk, type ChunkPhysics } from './chunk-pool.js';
import { InstancedChunks } from './instanced-chunks.js';

/** Something that can fall into the water: an id and a position. */
export interface Floater {
  id: string;
  x: number;
  y: number;
  z: number;
}

/** A splash to show: where (on the water surface) and how big. */
export interface Splash {
  x: number;
  z: number;
  /** Ring end radius in metres. */
  radius: number;
}

/** A thing that disappears within this height (m) above the water is taken to have sunk in it. */
const VANISH_MARGIN = 0.4;

/**
 * Pure detector: remembers each id's last position and reports one splash when it crosses down
 * through the surface, or vanishes while just above or below it (a projectile that is removed on
 * entering the water). Cosmetic only; reads positions, never feeds anything back.
 */
export class SplashTracker {
  private last = new Map<string, Floater>();

  /** Compares `items` with the previous call and returns the new splashes. */
  update(items: readonly Floater[], level: number, radius: number): Splash[] {
    const out: Splash[] = [];
    const next = new Map<string, Floater>();
    for (const it of items) {
      const prev = this.last.get(it.id);
      if (prev && prev.y > level && it.y <= level) out.push({ x: it.x, z: it.z, radius });
      next.set(it.id, it);
    }
    for (const [id, prev] of this.last) {
      if (!next.has(id) && prev.y <= level + VANISH_MARGIN) {
        out.push({ x: prev.x, z: prev.z, radius });
      }
    }
    this.last = next;
    return out;
  }

  /** Forgets everything (no splash fires for what was tracked). */
  reset(): void {
    this.last.clear();
  }
}

/** Ring seconds. */
const RING_LIFE = 1.1;
const RING_SLOTS = 6;
const DROPLET_LIFE = 0.7;
const DROPLET: ChunkPhysics = { gravity: 12, drag: 0.1, restitution: 0 };
const PROJECTILE_RADIUS = 1.1;
const SNAIL_RADIUS = 1.8;

interface RingSlot {
  mesh: THREE.Mesh;
  age: number;
  radius: number;
  active: boolean;
}

/** Options for {@link SplashEffects}. */
export interface SplashEffectsOptions {
  /** World Y of the water surface. */
  level: number;
  /** Tier particle multiplier (scales droplet counts). */
  quality?: number;
  /** Random source (inject for deterministic captures). */
  random?: () => number;
}

/** Ring that expands and fades, plus a few droplets, where projectiles and snails hit water. */
export class SplashEffects {
  /** Attach this to `roots.effects`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: detects water entries from the render state and animates. */
  readonly updater: FrameUpdater;
  private readonly rings: RingSlot[] = [];
  private readonly ringGeo = new THREE.RingGeometry(0.82, 1, 28).rotateX(-Math.PI / 2);
  private readonly dropGeo = new THREE.IcosahedronGeometry(1, 0);
  private readonly dropMat = createToonMaterial({ color: 0xffffff, flat: true });
  private readonly drops: InstancedChunks;
  private readonly projectiles = new SplashTracker();
  private readonly snails = new SplashTracker();
  private readonly level: number;
  private readonly quality: number;
  private readonly random: () => number;
  private next = 0;

  /** Creates the pooled rings and droplets (all idle). */
  constructor(opts: SplashEffectsOptions) {
    this.level = opts.level;
    this.quality = Math.min(1, Math.max(0.2, opts.quality ?? 1));
    this.random = opts.random ?? Math.random;
    this.group.name = 'splashes';
    for (let i = 0; i < RING_SLOTS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: PALETTE.waterFoam,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: true,
      });
      const mesh = new THREE.Mesh(this.ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.rings.push({ mesh, age: 0, radius: 1, active: false });
    }
    this.drops = new InstancedChunks(this.dropGeo, this.dropMat, 48, DROPLET, {
      scale: debrisScale,
    });
    this.group.add(this.drops.mesh);
    this.updater = (dt, state) => {
      if (state) this.detect(state);
      this.advance(dt);
    };
  }

  /** Number of rings currently animating. */
  get activeRings(): number {
    return this.rings.filter((r) => r.active).length;
  }

  /** Number of live droplets. */
  get liveDroplets(): number {
    return this.drops.live;
  }

  /** Starts a splash at (x, z) on the water surface. */
  spawn(s: Splash): void {
    const slot = this.rings[this.next];
    if (!slot) return;
    this.next = (this.next + 1) % this.rings.length;
    slot.active = true;
    slot.age = 0;
    slot.radius = s.radius;
    slot.mesh.visible = true;
    slot.mesh.position.set(s.x, this.level + 0.04, s.z);
    const n = Math.round(8 * this.quality);
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2;
      const out = 0.6 + this.random() * s.radius * 0.7;
      emitChunk(this.drops.pool, {
        x: s.x,
        y: this.level + 0.05,
        z: s.z,
        vx: Math.cos(a) * out,
        vy: 2.5 + this.random() * 2.5,
        vz: Math.sin(a) * out,
        rx: 0,
        ry: 0,
        rz: 0,
        sx: 0,
        sy: 0,
        sz: 0,
        size: 0.05 + this.random() * 0.06,
        colour: PALETTE.waterFoam,
        life: DROPLET_LIFE,
        floorY: this.level - 0.3,
      });
    }
  }

  private detect(state: RenderState): void {
    const snap = state.snapshot;
    const shots: Floater[] = snap.projectiles.map((p) => ({ id: p.id, ...flat(p.position) }));
    for (const s of this.projectiles.update(shots, this.level, PROJECTILE_RADIUS)) this.spawn(s);
    const bodies: Floater[] = [];
    for (const t of snap.teams) {
      for (const sn of t.snails) bodies.push({ id: sn.id, ...flat(sn.position) });
    }
    for (const s of this.snails.update(bodies, this.level, SNAIL_RADIUS)) this.spawn(s);
  }

  private advance(dt: number): void {
    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      const t = r.age / RING_LIFE;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const ease = 1 - (1 - t) * (1 - t);
      const s = r.radius * (0.2 + 0.8 * ease);
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t) * Math.min(1, t * 12);
    }
    this.drops.advance(dt);
  }

  /** Frees GPU resources and detaches from the scene. */
  dispose(): void {
    for (const r of this.rings) (r.mesh.material as THREE.Material).dispose();
    this.drops.dispose();
    this.ringGeo.dispose();
    this.dropGeo.dispose();
    this.dropMat.dispose();
    this.group.removeFromParent();
  }
}

function flat(p: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return { x: p.x, y: p.y, z: p.z };
}
