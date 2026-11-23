import type * as THREE from 'three';
import type { QualityTier } from '../quality.js';
import type { RenderLoop } from '../render-loop.js';
import { postConfigForTier, type PostConfig } from './post-config.js';
import type { FrameRenderer } from './post-pipeline.js';

/** Scene, camera and size handed to the post chain factory. */
export interface PostContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
}

/** Builds a post chain for a config (async: it loads the libraries lazily). */
export type PostFactory = (config: PostConfig, ctx: PostContext) => Promise<FrameRenderer>;

/** Keeps a loop's post chain in step with the quality tier. */
export interface PostController {
  /** Last known view size in CSS pixels (used for chains built later). */
  size: [number, number];
  /** Switches to the chain of `tier`, building or dropping it as needed. */
  apply(tier: QualityTier): void;
  /** Resolves true once the chain of the latest `apply` is active. */
  ready(): Promise<boolean>;
  /** Discards any chain still being built. */
  dispose(): void;
}

/**
 * Creates the controller and applies `tier`. Without a factory it never builds anything. Builds
 * are async; a build that finishes after a newer `apply` (or `dispose`) is disposed and ignored.
 */
export function createPostController(
  deps: { tier: QualityTier; createPost?: PostFactory },
  loop: RenderLoop,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): PostController {
  let current: PostConfig | null = null;
  let gen = 0;
  let ready = Promise.resolve(false);
  const c: PostController = {
    size: [1, 1],
    ready: () => ready,
    apply(tier) {
      const cfg = deps.createPost ? postConfigForTier(tier) : null;
      if (cfg === current) return;
      current = cfg;
      const mine = ++gen;
      if (!cfg || !deps.createPost) {
        loop.setPost(null);
        ready = Promise.resolve(false);
        return;
      }
      ready = deps.createPost(cfg, { scene, camera, width: c.size[0], height: c.size[1] }).then(
        (chain) => {
          if (mine !== gen) chain.dispose();
          else loop.setPost(chain);
          return mine === gen;
        },
        () => false,
      );
    },
    dispose() {
      gen++;
      current = null;
    },
  };
  c.apply(deps.tier);
  return c;
}
