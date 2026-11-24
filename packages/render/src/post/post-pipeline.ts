import { HalfFloatType, Uniform, Vector3 } from 'three';
import type { Camera, Scene, WebGLRenderer } from 'three';
import type { PostConfig } from './post-config.js';

/** What the render loop needs from a post-processing chain. */
export interface FrameRenderer {
  /** Renders the scene through the chain; `dt` is seconds since the last frame. */
  render(dt: number): void;
  /** Resizes the chain's buffers (CSS pixels; the renderer's pixel ratio applies). */
  setSize(width: number, height: number): void;
  /** Releases all GPU resources. */
  dispose(): void;
}

/** The lazily loaded libraries (kept out of the main bundle and the phone controller). */
export interface PostModules {
  postprocessing: typeof import('postprocessing');
  n8ao: typeof import('n8ao');
}

/** Loads the post-processing libraries (dynamic import, so phones never fetch them). */
export const loadPostModules = async (): Promise<PostModules> => {
  const [postprocessing, n8ao] = await Promise.all([import('postprocessing'), import('n8ao')]);
  return { postprocessing, n8ao };
};

/** Inputs of {@link createPostPipeline}. */
export interface PostPipelineDeps {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  config: PostConfig;
  /** Initial size in CSS pixels. */
  width: number;
  height: number;
  /** Library loader override (tests). */
  load?: () => Promise<PostModules>;
}

const WARM_GRADE_FRAGMENT = /* glsl */ `
uniform vec3 uWarm;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(inputColor.rgb * uWarm, inputColor.a);
}`;

type Pp = PostModules['postprocessing'];

function addAo(
  composer: InstanceType<Pp['EffectComposer']>,
  deps: PostPipelineDeps,
  m: PostModules,
) {
  const ao = deps.config.ao;
  if (!ao) return;
  const pass = new m.n8ao.N8AOPostPass(deps.scene, deps.camera, deps.width, deps.height);
  pass.setQualityMode('Medium');
  pass.configuration.halfRes = true;
  pass.configuration.aoRadius = ao.radius;
  pass.configuration.distanceFalloff = ao.distanceFalloff;
  pass.configuration.intensity = ao.intensity;
  composer.addPass(pass);
}

function buildEffects(cfg: PostConfig, pp: Pp): InstanceType<Pp['Effect']>[] {
  const effects: InstanceType<Pp['Effect']>[] = [];
  if (cfg.bloom) {
    effects.push(
      new pp.BloomEffect({
        intensity: cfg.bloom.intensity,
        luminanceThreshold: cfg.bloom.threshold,
        luminanceSmoothing: cfg.bloom.smoothing,
        mipmapBlur: true,
      }),
    );
  }
  if (cfg.warm) {
    const uniforms = new Map([['uWarm', new Uniform(new Vector3(...cfg.warm))]]);
    effects.push(new pp.Effect('WarmGradeEffect', WARM_GRADE_FRAGMENT, { uniforms }));
  }
  effects.push(new pp.ToneMappingEffect({ mode: pp.ToneMappingMode.AGX }));
  if (cfg.vignette) effects.push(new pp.VignetteEffect(cfg.vignette));
  return effects;
}

/**
 * Builds the composer for a config. `full`: render, N8AO, then one pass of bloom + warm grade +
 * AgX tone mapping + vignette, then SMAA. `basic`: render, AgX tone mapping, SMAA. The renderer's
 * own tone mapping does not apply to render targets, so AgX lives in the chain exactly once.
 */
export async function createPostPipeline(deps: PostPipelineDeps): Promise<FrameRenderer> {
  const modules = await (deps.load ?? loadPostModules)();
  const pp = modules.postprocessing;
  const composer = new pp.EffectComposer(deps.renderer, {
    frameBufferType: HalfFloatType,
    multisampling: 0,
  });
  composer.addPass(new pp.RenderPass(deps.scene, deps.camera));
  addAo(composer, deps, modules);
  composer.addPass(new pp.EffectPass(deps.camera, ...buildEffects(deps.config, pp)));
  const smaa = new pp.SMAAEffect({ preset: pp.SMAAPreset.HIGH });
  composer.addPass(new pp.EffectPass(deps.camera, smaa));
  composer.setSize(deps.width, deps.height, false);
  return {
    render: (dt) => composer.render(dt),
    setSize: (w, h) => composer.setSize(w, h, false),
    dispose: () => composer.dispose(),
  };
}
