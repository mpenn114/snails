import * as THREE from 'three';
import type { Crate, SimEvent } from '@snails/core';
import type { FrameUpdater } from '../render-loop.js';
import { canvasLabelFactory, type LabelTextureFactory } from '../snail-assets.js';
import { PALETTE } from '../style/palette.js';

/** Edge length of the crate box in metres (matches the sim's 0.4 m radius). */
const BOX = 0.8;
/** How fast a view eases toward its snapshot position (1/s); hides the 20 Hz snapshot steps. */
const FOLLOW_RATE = 14;
/** Seconds a pop (pickup or destruction burst) lives. */
const POP_LIFE = 0.75;
const POP_SLOTS = 4;
const POP_CHIPS = 6;
const CHIP_SPEED = 3.2;
const CHIP_GRAVITY = 9;
/** Sway of a parachuting crate (radians, rad/s). */
const SWAY = 0.12;
/** Floating pickup text: seconds it lives, metres it rises, and its width in metres. */
const FLOAT_LIFE = 2.2;
const FLOAT_RISE = 2.6;
const FLOAT_WIDTH = 4;

interface FloatText {
  sprite: THREE.Sprite;
  age: number;
}
const SWAY_RATE = 2.2;

const BAND_COLOURS: readonly { match: string; colour: number }[] = [
  { match: 'health', colour: 0xe5283f },
  { match: 'supply', colour: PALETTE.uiAccent },
  { match: 'utility', colour: PALETTE.waterShallow },
  { match: 'mystery', colour: 0xb07cff },
  { match: 'calcium', colour: PALETTE.waterFoam },
];

/** Band colour for a crate definition id: chosen by the kind word in the id, else the accent. */
export function crateBandColour(defId: string): number {
  return BAND_COLOURS.find((b) => defId.includes(b.match))?.colour ?? PALETTE.uiAccent;
}

/** Shared geometry and materials: crates cost a few draws each, whatever the quality tier. */
export class CrateAssets {
  readonly box = new THREE.BoxGeometry(BOX, BOX, BOX);
  readonly band = new THREE.BoxGeometry(BOX + 0.04, 0.2, BOX + 0.04);
  /** Leaf parachute: a flat six-sided cone, cupped side down. */
  readonly leaf = new THREE.ConeGeometry(0.95, 0.4, 6);
  readonly strings = createStringGeometry();
  readonly chip = new THREE.TetrahedronGeometry(0.12);
  readonly shell = new THREE.IcosahedronGeometry(1, 0);
  readonly wood = new THREE.MeshLambertMaterial({ color: PALETTE.soil });
  readonly leafMat = new THREE.MeshLambertMaterial({
    color: PALETTE.grassTop,
    flatShading: true,
  });
  readonly stringMat = new THREE.LineBasicMaterial({ color: PALETTE.uiInk });
  private readonly bands = new Map<number, THREE.MeshLambertMaterial>();

  /** Band material for a colour (shared between crates of the same kind). */
  bandMaterial(colour: number): THREE.MeshLambertMaterial {
    let m = this.bands.get(colour);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: colour });
      this.bands.set(colour, m);
    }
    return m;
  }

  /** Frees every shared GPU resource. */
  dispose(): void {
    for (const g of [this.box, this.band, this.leaf, this.strings, this.chip, this.shell]) {
      g.dispose();
    }
    for (const m of [this.wood, this.leafMat, this.stringMat, ...this.bands.values()]) m.dispose();
    this.bands.clear();
  }
}

/** Four strings from the box's top corners up to the leaf rim, as one line-segment geometry. */
function createStringGeometry(): THREE.BufferGeometry {
  const pts: number[] = [];
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    pts.push(sx * 0.36, BOX / 2, sz * 0.36, sx * 0.62, 1.05, sz * 0.62);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

interface CrateView {
  group: THREE.Group;
  chute: THREE.Group;
  placed: boolean;
}

function createCrateView(defId: string, assets: CrateAssets): CrateView {
  const group = new THREE.Group();
  group.name = 'crate';
  const box = new THREE.Mesh(assets.box, assets.wood);
  const band = new THREE.Mesh(assets.band, assets.bandMaterial(crateBandColour(defId)));
  const chute = new THREE.Group();
  const leaf = new THREE.Mesh(assets.leaf, assets.leafMat);
  leaf.position.y = 1.2;
  leaf.rotation.x = Math.PI;
  chute.add(leaf, new THREE.LineSegments(assets.strings, assets.stringMat));
  group.add(box, band, chute);
  return { group, chute, placed: false };
}

interface Pop {
  group: THREE.Group;
  shell: THREE.Mesh;
  shellMat: THREE.MeshBasicMaterial;
  chips: THREE.Mesh[];
  chipMat: THREE.MeshLambertMaterial;
  velocities: THREE.Vector3[];
  /** Seconds since start; negative when the slot is free. */
  age: number;
}

/**
 * Draws every `GameState.crates` entry: a small wooden box with a colour band for its kind and,
 * while it is falling, a leaf parachute. Pickups and destruction (`crateCollected`,
 * `crateDestroyed` events) play a short pop: an expanding shell and a few chips. Pure view; no
 * randomness (chip directions come from the slot index), pooled pops, shared geometry.
 */
export class CrateLayer {
  /** Attach this to `roots.effects`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: syncs from the render state and animates pops each frame. */
  readonly updater: FrameUpdater;
  private readonly views = new Map<string, CrateView>();
  private readonly assets = new CrateAssets();
  private readonly pops: Pop[] = [];
  private readonly floats: FloatText[] = [];
  private clock = 0;

  /** Creates an empty layer; `labelFactory` draws the floating pickup text (canvas by default). */
  constructor(private readonly labelFactory: LabelTextureFactory = canvasLabelFactory) {
    this.group.name = 'crates';
    for (let i = 0; i < POP_SLOTS; i++) this.pops.push(this.createPop());
    this.updater = (dt, state) => {
      this.clock += dt;
      if (state) this.sync(state.snapshot.crates ?? [], dt);
      this.stepPops(dt);
      this.stepFloats(dt);
    };
  }

  /** Number of live crate views. */
  get size(): number {
    return this.views.size;
  }

  /** Number of pops currently playing. */
  get activePops(): number {
    return this.pops.filter((p) => p.age >= 0).length;
  }

  /** Creates, moves and removes views to match `crates` by id; `dt` eases the motion. */
  sync(crates: readonly Crate[], dt = 0): void {
    const seen = new Set<string>();
    const follow = 1 - Math.exp(-FOLLOW_RATE * dt);
    for (const c of crates) {
      seen.add(c.id);
      let view = this.views.get(c.id);
      if (!view) {
        view = createCrateView(c.defId, this.assets);
        this.views.set(c.id, view);
        this.group.add(view.group);
      }
      const p = view.group.position;
      if (view.placed) p.lerp(new THREE.Vector3(c.position.x, c.position.y, c.position.z), follow);
      else p.set(c.position.x, c.position.y, c.position.z);
      view.placed = true;
      view.chute.visible = !c.grounded;
      view.group.rotation.z = c.grounded ? 0 : Math.sin(this.clock * SWAY_RATE) * SWAY;
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      view.group.removeFromParent();
      this.views.delete(id);
    }
  }

  /** Starts a pop for `crateCollected` and `crateDestroyed` events. */
  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'crateCollected') {
        this.startPop(e.position, crateBandColour(e.defId));
        this.startFloat(e.position, e.text);
      }
      else if (e.type === 'crateDestroyed') this.startPop(e.position, PALETTE.soil);
    }
  }

  private createPop(): Pop {
    const group = new THREE.Group();
    group.visible = false;
    const shellMat = new THREE.MeshBasicMaterial({
      color: PALETTE.waterFoam,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const chipMat = new THREE.MeshLambertMaterial({ color: PALETTE.uiAccent });
    const shell = new THREE.Mesh(this.assets.shell, shellMat);
    const chips: THREE.Mesh[] = [];
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < POP_CHIPS; i++) {
      const a = (2 * Math.PI * i) / POP_CHIPS;
      chips.push(new THREE.Mesh(this.assets.chip, chipMat));
      velocities.push(
        new THREE.Vector3(
          Math.cos(a) * CHIP_SPEED * 0.6,
          CHIP_SPEED,
          Math.sin(a) * CHIP_SPEED * 0.6,
        ),
      );
    }
    group.add(shell, ...chips);
    this.group.add(group);
    return { group, shell, shellMat, chips, chipMat, velocities, age: -1 };
  }

  private startPop(at: { x: number; y: number; z: number }, colour: number): void {
    const pop = this.pops.find((p) => p.age < 0) ?? this.pops[0];
    if (!pop) return;
    pop.age = 0;
    pop.group.visible = true;
    pop.group.position.set(at.x, at.y, at.z);
    pop.chipMat.color.setHex(colour);
    for (const chip of pop.chips) chip.position.set(0, 0, 0);
  }

  /** Number of floating pickup texts alive. */
  get activeFloats(): number {
    return this.floats.length;
  }

  private startFloat(at: { x: number; y: number; z: number }, text: string): void {
    const material = new THREE.SpriteMaterial({
      map: this.labelFactory(text),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(FLOAT_WIDTH, FLOAT_WIDTH / 4, 1);
    sprite.position.set(at.x, at.y + 1, at.z);
    sprite.renderOrder = 10;
    this.group.add(sprite);
    this.floats.push({ sprite, age: 0 });
  }

  private stepFloats(dt: number): void {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      if (!f) continue;
      f.age += dt;
      const t = f.age / FLOAT_LIFE;
      if (t >= 1) {
        this.freeFloat(f);
        this.floats.splice(i, 1);
        continue;
      }
      f.sprite.position.y += (FLOAT_RISE / FLOAT_LIFE) * dt;
      f.sprite.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    }
  }

  private freeFloat(f: FloatText): void {
    f.sprite.material.map?.dispose();
    f.sprite.material.dispose();
    f.sprite.removeFromParent();
  }

  private stepPops(dt: number): void {
    for (const pop of this.pops) {
      if (pop.age < 0) continue;
      pop.age += dt;
      const t = pop.age / POP_LIFE;
      if (t >= 1) {
        pop.age = -1;
        pop.group.visible = false;
        continue;
      }
      pop.shell.scale.setScalar(0.3 + 1.7 * t);
      pop.shellMat.opacity = 0.55 * (1 - t);
      pop.chips.forEach((chip, i) => {
        const v = pop.velocities[i];
        if (!v) return;
        chip.position.set(
          v.x * pop.age,
          v.y * pop.age - 0.5 * CHIP_GRAVITY * pop.age ** 2,
          v.z * pop.age,
        );
        chip.scale.setScalar(1 - t);
      });
    }
  }

  /** Removes all views and frees shared and per-pop GPU resources. */
  dispose(): void {
    this.views.clear();
    for (const f of this.floats) this.freeFloat(f);
    this.floats.length = 0;
    for (const pop of this.pops) {
      pop.shellMat.dispose();
      pop.chipMat.dispose();
    }
    this.assets.dispose();
    this.group.removeFromParent();
  }
}
