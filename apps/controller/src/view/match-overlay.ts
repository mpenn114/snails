import type { GameSnapshot, SimEvent } from '@snails/core';
import { tryCapture } from '../platform/pointer';
import { CameraController } from './camera-controller';
import type { RigLike } from './camera-controller';
import { GestureTracker } from './camera-gestures';
import { KillFeed, rosterNamer, teamHealth } from './hud';
import { HudView } from './hud-view';
import { MinimapView } from './minimap-view';
import type { HeightGridLike } from './minimap';

/** Inputs of the in-match overlay. */
export interface MatchOverlayDeps {
  container: HTMLElement;
  rig: RigLike & { pose(): { distance: number } };
  grid: HeightGridLike;
  teams: readonly { snails: readonly { id: string; name: string }[] }[];
  now: () => number;
  doc?: Document;
}

/**
 * Per-match camera control, minimap and HUD: wires pointer gestures on the view container to the
 * {@link CameraController}, and feeds snapshots/events to the minimap and DOM HUD.
 */
export class MatchOverlay {
  readonly camera: CameraController;
  private readonly hud: HudView;
  private readonly minimap: MinimapView;
  private readonly gestures: GestureTracker;
  private readonly feed = new KillFeed();
  private readonly name: (id: string) => string;
  private readonly maxSeen = new Map<string, number>();
  private lastDraw = Number.NEGATIVE_INFINITY;
  private snapshot: GameSnapshot | null = null;
  private readonly offMode: () => void;
  private readonly down = (e: PointerEvent): void => {
    // Capture keeps multi-touch moves flowing off the canvas; Safari may throw, which is fine.
    tryCapture(e.currentTarget as HTMLElement, e.pointerId);
    this.gestures.down(e.pointerId, e.clientX, e.clientY);
  };
  private readonly move = (e: PointerEvent): void => {
    const input = this.gestures.move(e.pointerId, e.clientX, e.clientY);
    if (input) this.camera.gesture(input);
  };
  private readonly up = (e: PointerEvent): void => this.gestures.up(e.pointerId);

  constructor(private readonly deps: MatchOverlayDeps) {
    const doc = deps.doc ?? document;
    this.camera = new CameraController(deps.rig);
    this.name = rosterNamer(deps.teams);
    this.gestures = new GestureTracker(() => deps.rig.pose().distance);
    this.hud = new HudView(doc, { onModeButton: () => this.camera.cycle() });
    this.minimap = new MinimapView(doc, { onTap: (x, z) => this.camera.jumpTo(x, z) });
    this.minimap.setGrid(deps.grid);
    this.hud.addMinimap(this.minimap.canvas);
    this.hud.setMode(this.camera.mode);
    this.offMode = this.camera.onModeChange((m) => this.hud.setMode(m));
    deps.container.appendChild(this.hud.root);
    deps.container.style.touchAction = 'none';
    const c = deps.container;
    c.addEventListener('pointerdown', this.down);
    c.addEventListener('pointermove', this.move);
    c.addEventListener('pointerup', this.up);
    c.addEventListener('pointercancel', this.up);
    c.addEventListener('lostpointercapture', this.up);
  }

  /** Server `turnStart`. */
  turnStart(): void {
    this.camera.turnStart();
  }

  /** Relayed aim of the active snail. */
  aimPreview(snailId: string, angle: number): void {
    this.camera.aimPreview(snailId, angle);
  }

  /** Per-frame hook (register with the render loop). */
  update(): void {
    this.camera.update();
  }

  /** A mapped snapshot arrived. */
  onSnapshot(snapshot: GameSnapshot): void {
    this.snapshot = snapshot;
    this.camera.onSnapshot(snapshot);
    this.redraw();
  }

  /** Simulation events arrived. */
  onEvents(events: readonly SimEvent[]): void {
    const now = this.deps.now();
    this.feed.push(events, now, this.name);
    if (events.some((e) => e.type === 'terrainCarved' || e.type === 'terrainCollapsed')) {
      this.minimap.terrainChanged();
    }
  }

  /** Removes listeners and DOM. */
  dispose(): void {
    const c = this.deps.container;
    c.removeEventListener('pointerdown', this.down);
    c.removeEventListener('pointermove', this.move);
    c.removeEventListener('pointerup', this.up);
    c.removeEventListener('pointercancel', this.up);
    c.removeEventListener('lostpointercapture', this.up);
    this.offMode();
    this.minimap.dispose();
    this.hud.dispose();
  }

  private redraw(): void {
    const snap = this.snapshot;
    const now = this.deps.now();
    if (!snap || now - this.lastDraw < 100) return;
    this.lastDraw = now;
    this.minimap.draw(snap);
    this.hud.update(snap, teamHealth(snap, this.maxSeen), this.feed.visible(now));
  }
}
