import type { Camera, Scene, WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { POST_CONFIGS } from './post-config.js';
import { createPostPipeline, type PostModules } from './post-pipeline.js';

/** Records constructor calls so the chain order can be asserted without WebGL. */
function fakeModules() {
  const log: string[] = [];
  const composer = { setSize: vi.fn(), render: vi.fn(), dispose: vi.fn() };
  const ao = {
    setQualityMode: vi.fn(),
    configuration: { halfRes: false, aoRadius: 0, distanceFalloff: 0, intensity: 0 },
  };
  const pp = {
    EffectComposer: class {
      constructor() {
        log.push('composer');
        Object.assign(this, composer);
      }
      addPass(p: unknown): void {
        log.push(`add:${(p as { tag?: string }).tag ?? '?'}`);
      }
    },
    RenderPass: class {
      tag = 'render';
    },
    EffectPass: class {
      tag = 'effects';
      constructor(_c: unknown, ...fx: { n?: string }[]) {
        log.push(`effects[${fx.map((f) => f.n ?? '?').join(',')}]`);
      }
    },
    SMAAEffect: class {
      n = 'smaa';
    },
    SMAAPreset: { HIGH: 2 },
    BloomEffect: class {
      n = 'bloom';
    },
    VignetteEffect: class {
      n = 'vignette';
    },
    ToneMappingEffect: class {
      n = 'agx';
    },
    ToneMappingMode: { AGX: 9 },
    Effect: class {
      n = 'warm';
      uniforms = new Map();
    },
  };
  const n8ao = {
    N8AOPostPass: class {
      tag = 'ao';
      constructor() {
        Object.assign(this, ao);
      }
    },
  };
  const load = () => Promise.resolve({ postprocessing: pp, n8ao } as unknown as PostModules);
  return { log, composer, ao, load };
}

const deps = (load: () => Promise<PostModules>, mode: 'full' | 'basic') => ({
  renderer: {} as WebGLRenderer,
  scene: {} as Scene,
  camera: {} as Camera,
  config: POST_CONFIGS[mode],
  width: 640,
  height: 360,
  load,
});

describe('post pipeline', () => {
  it('full: render, AO, one effects pass, then SMAA; configures AO', async () => {
    const f = fakeModules();
    const chain = await createPostPipeline(deps(f.load, 'full'));
    expect(f.log).toContain('effects[bloom,warm,agx,vignette]');
    expect(f.log.filter((l) => l.startsWith('add:'))).toEqual([
      'add:render',
      'add:ao',
      'add:effects',
      'add:effects',
    ]);
    expect(f.log[f.log.length - 1]).not.toBe('add:ao');
    expect(f.ao.configuration.halfRes).toBe(true);
    expect(f.ao.configuration.intensity).toBe(POST_CONFIGS.full.ao?.intensity);
    expect(f.composer.setSize).toHaveBeenCalledWith(640, 360, false);
    chain.setSize(100, 50);
    expect(f.composer.setSize).toHaveBeenLastCalledWith(100, 50, false);
    chain.render(0.016);
    expect(f.composer.render).toHaveBeenCalledWith(0.016);
    chain.dispose();
    expect(f.composer.dispose).toHaveBeenCalled();
  });
  it('basic: tone mapping and SMAA only, no AO', async () => {
    const f = fakeModules();
    await createPostPipeline(deps(f.load, 'basic'));
    expect(f.log).toContain('effects[agx]');
    expect(f.log).toContain('effects[smaa]');
    expect(f.log).not.toContain('add:ao');
  });
});
