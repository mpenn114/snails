import {
  MatchRenderer,
  WireSnapshotMapper,
  createCappedScheduler,
  createGameView,
  qualitySettings,
} from '@snails/render';
import type { GameView, QualityTier, ViewEnvironment } from '@snails/render';
import { decodeEventBatch, decodeSnapshot } from '@snails/protocol';
import type { ServerMessage } from '@snails/protocol';
import type { SimEvent } from '@snails/core';
import type { MatchStarted } from './wire-types';
import { BatterySaverState, watchBattery } from './battery-saver';
import type { BatteryNavigator } from './battery-saver';
import { QualityGovernor } from './quality-governor';
import type { QualityLevel } from './quality-governor';
import { buildTerrainInit } from './terrain-init';
import { MatchOverlay } from './match-overlay';

/** Subset of the WebGL renderer touched when scaling resolution. */
interface PixelRatioTarget {
  setPixelRatio(ratio: number): void;
}

/** Environment of the phone view (injectable; defaults are the browser globals). */
export interface PhoneViewDeps {
  now: () => number;
  devicePixelRatio: () => number;
  navigator: BatteryNavigator;
}

/**
 * Phone-side 3D view (ADR-0008): replays the server's authoritative stream locally. Terrain is
 * rebuilt from seed + params on `matchStarted`; snapshots and event batches feed the shared
 * {@link MatchRenderer} with interpolation. Runs on the `mobile` tier with adaptive quality, a
 * battery saver, a capped pixel ratio, and pauses rendering while the page is hidden.
 */
export class PhoneView {
  private readonly deps: PhoneViewDeps;
  private readonly governor = new QualityGovernor();
  private readonly saver: BatterySaverState;
  private renderer: MatchRenderer | null = null;
  private mapper: WireSnapshotMapper | null = null;
  private overlay: MatchOverlay | null = null;
  private aiming = false;
  private canvas: HTMLCanvasElement | null = null;
  private container: HTMLElement | null = null;
  private glRenderer: PixelRatioTarget | null = null;
  private hidden = false;
  private stopBattery: (() => void) | null = null;
  private disposed = false;
  private readonly onResize = (): void => this.resize();
  private readonly onVisibility = (): void => this.setHidden(document.hidden);

  constructor(deps: Partial<PhoneViewDeps> = {}) {
    this.deps = {
      now: () => performance.now(),
      devicePixelRatio: () => window.devicePixelRatio || 1,
      navigator: navigator as BatteryNavigator,
      ...deps,
    };
    this.saver = new BatterySaverState((on) =>
      this.applyChange(this.governor.setBatterySaver(on, this.deps.now())),
    );
  }

  /** Creates the canvas inside `container` and starts listening for resize and visibility. */
  mount(container: HTMLElement): void {
    this.container = container;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    container.appendChild(canvas);
    this.canvas = canvas;
    this.renderer = new MatchRenderer({
      now: () => this.deps.now(),
      makeView: (env) => this.makeView(canvas, env),
    });
    this.renderer.setTier(this.governor.settings.tier);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
    void watchBattery(this.deps.navigator, (low) => this.saver.setAuto(low)).then((stop) => {
      if (this.disposed) stop();
      else this.stopBattery = stop;
    });
  }

  /** Toggles the battery saver manually (30 fps cap, lowest quality). */
  setBatterySaver(on: boolean): void {
    this.saver.setManual(on);
  }

  /** Whether the battery saver is active. */
  get batterySaver(): boolean {
    return this.saver.active;
  }

  /** Feeds one validated server message; unrelated message types are ignored. */
  onMessage(msg: ServerMessage): void {
    const r = this.renderer;
    if (!r) return;
    if (msg.type === 'matchStarted') {
      this.mapper = new WireSnapshotMapper({
        seed: msg.seed,
        teams: msg.teams,
        terrain: msg.terrain,
      });
      r.init(buildTerrainInit(msg.seed, msg.terrain));
      this.startOverlay(r, msg.teams);
    } else if (msg.type === 'snapshot' && this.mapper) {
      const snap = this.mapper.map(decodeSnapshot(msg));
      r.pushSnapshot(snap);
      this.overlay?.onSnapshot(snap);
    } else if (msg.type === 'eventBatch') {
      const events = decodeEventBatch(msg) as unknown as SimEvent[];
      r.handleEvents(events);
      this.overlay?.onEvents(events);
    } else if (msg.type === 'turnStart') {
      this.overlay?.turnStart();
    } else if (msg.type === 'aimPreview') {
      this.overlay?.aimPreview(msg.snailId, msg.angle);
    }
  }

  /** The local player started/stopped aiming: the camera sits over the shoulder while true. */
  setAiming(aiming: boolean): void {
    this.aiming = aiming;
    this.overlay?.camera.setAiming(aiming);
  }

  private startOverlay(r: MatchRenderer, teams: MatchStarted['teams']): void {
    this.overlay?.dispose();
    this.overlay = null;
    const rig = r.cameraRig;
    const replica = r.terrainReplica;
    if (!rig || !replica || !this.container || !r.view) return;
    const overlay = new MatchOverlay({
      container: this.container,
      rig,
      grid: replica.grid,
      teams,
      now: () => this.deps.now(),
    });
    if (this.aiming) overlay.camera.setAiming(true);
    r.view.addUpdater(() => overlay.update());
    this.overlay = overlay;
  }

  /** Releases GPU resources, listeners and the canvas. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.stopBattery?.();
    this.overlay?.dispose();
    this.overlay = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas?.remove();
    this.canvas = null;
    this.container = null;
  }

  private makeView(canvas: HTMLCanvasElement, env: ViewEnvironment): GameView {
    const level = this.governor.settings;
    const view = createGameView(canvas, {
      tier: level.tier,
      terrainBounds: env.bounds,
      waterLevel: env.waterLevel,
      onRenderer: (r) => (this.glRenderer = r),
      scheduler: createCappedScheduler({
        base: {
          request: (cb) => window.requestAnimationFrame(cb),
          cancel: (h) => window.cancelAnimationFrame(h),
        },
        now: () => this.deps.now(),
        getMaxFps: () => this.governor.fpsCap,
      }),
    });
    view.addUpdater((dt) => {
      if (this.hidden || dt <= 0) return;
      this.applyChange(this.governor.pushFrame(dt * 1000, this.deps.now()));
    });
    this.scalePixelRatio(level.tier, level.pixelRatioScale);
    if (this.hidden) view.loop.stop();
    return view;
  }

  private applyChange(change: { settings: QualityLevel } | null): void {
    if (!change || !this.renderer) return;
    this.renderer.setTier(change.settings.tier);
    this.scalePixelRatio(change.settings.tier, change.settings.pixelRatioScale);
  }

  private scalePixelRatio(tier: QualityTier, scale: number): void {
    const ratio = qualitySettings(tier, this.deps.devicePixelRatio()).pixelRatio * scale;
    this.glRenderer?.setPixelRatio(ratio);
  }

  private resize(): void {
    const c = this.container;
    this.renderer?.resize(
      c?.clientWidth || window.innerWidth,
      c?.clientHeight || window.innerHeight,
    );
  }

  private setHidden(hidden: boolean): void {
    this.hidden = hidden;
    const loop = this.renderer?.view?.loop;
    if (!loop) return;
    if (hidden) loop.stop();
    else {
      this.governor.resetWindow(this.deps.now());
      loop.start();
    }
  }
}
