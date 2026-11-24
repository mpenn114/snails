import * as THREE from 'three';
import type { AreaInstance } from '@snails/core';
import type { FrameUpdater } from '../render-loop.js';
import { AreaAssets, createAreaView, type AreaView } from './area-views.js';

/**
 * Draws every `GameState.areas` entry with the view registered for its kind (`area-views.ts`:
 * puddle, goo splat; anything else gets a translucent dome). Shared geometry and materials,
 * `mobile`-cheap. Pure view: reads positions and radii from the snapshot.
 */
export class AreaLayer {
  /** Attach this to `roots.effects`. */
  readonly group = new THREE.Group();
  /** Loop-compatible updater: syncs from the render state each frame. */
  readonly updater: FrameUpdater;
  private readonly views = new Map<string, AreaView>();
  private readonly assets = new AreaAssets();
  private clock = 0;

  /** Creates an empty layer. */
  constructor() {
    this.group.name = 'areas';
    this.updater = (dt, state) => {
      this.clock += dt;
      if (state) this.sync(state.snapshot.areas ?? []);
    };
  }

  /** Number of live area views. */
  get size(): number {
    return this.views.size;
  }

  /** Creates, moves and removes views to match `areas` by id. */
  sync(areas: readonly AreaInstance[]): void {
    const seen = new Set<string>();
    for (const a of areas) {
      seen.add(a.id);
      let view = this.views.get(a.id);
      if (!view) {
        view = createAreaView(a.kind, this.assets);
        this.views.set(a.id, view);
        this.group.add(view.object);
      }
      view.update(a, this.clock);
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      view.object.removeFromParent();
      this.views.delete(id);
    }
  }

  /** Removes all views and frees the shared geometry and materials. */
  dispose(): void {
    this.views.clear();
    this.assets.dispose();
    this.group.removeFromParent();
  }
}
