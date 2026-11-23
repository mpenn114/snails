import { describe, expect, it, vi } from 'vitest';
import type { QualityTier } from '../quality.js';
import type { FrameScheduler } from '../render-loop.js';
import { createGameViewWith } from '../view.js';
import type { PostConfig } from './post-config.js';
import type { FrameRenderer } from './post-pipeline.js';

type Chain = FrameRenderer & { cfg: PostConfig };

function rendererStub() {
  return { render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn(), dispose: vi.fn() };
}

function setup(tier: QualityTier, withPost: boolean) {
  let cb: ((t: number) => void) | null = null;
  let time = 0;
  const scheduler: FrameScheduler = {
    request: (c) => ((cb = c), 1),
    cancel: () => void (cb = null),
  };
  const renderer = rendererStub();
  const chains: Chain[] = [];
  const createPost = vi.fn((cfg: PostConfig) => {
    const chain = { render: vi.fn(), setSize: vi.fn(), dispose: vi.fn(), cfg };
    chains.push(chain);
    return Promise.resolve(chain);
  });
  const view = createGameViewWith({
    tier,
    devicePixelRatio: 1,
    renderer,
    scheduler,
    now: () => time,
    ...(withPost ? { createPost } : {}),
  });
  const tick = (ms = 16): void => {
    time += ms;
    cb?.(time);
  };
  return { view, renderer, createPost, chains, tick };
}

describe('view post-processing', () => {
  it('renders directly until the chain is ready, then through it', async () => {
    const { view, renderer, chains, tick } = setup('high', true);
    view.resize(800, 450);
    tick();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(await view.postReady).toBe(true);
    tick();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(chains[0]?.render).toHaveBeenCalledTimes(1);
    expect(chains[0]?.cfg.mode).toBe('full');
    expect(chains[0]?.setSize).toHaveBeenCalledWith(800, 450);
    view.resize(1024, 576);
    expect(chains[0]?.setSize).toHaveBeenLastCalledWith(1024, 576);
  });
  it('is off without the opt-in and on cheap tiers', async () => {
    const off = setup('high', false);
    expect(await off.view.postReady).toBe(false);
    const low = setup('low', true);
    expect(await low.view.postReady).toBe(false);
    expect(low.createPost).not.toHaveBeenCalled();
    const mobile = setup('mobile', true);
    expect(mobile.createPost).not.toHaveBeenCalled();
  });
  it('medium gets the basic chain; tier changes swap and dispose chains', async () => {
    const { view, chains, tick } = setup('medium', true);
    expect(await view.postReady).toBe(true);
    expect(chains[0]?.cfg.mode).toBe('basic');
    view.setTier('high');
    expect(await view.postReady).toBe(true);
    expect(chains[0]?.dispose).toHaveBeenCalled();
    expect(chains[1]?.cfg.mode).toBe('full');
    view.setTier('mobile');
    expect(await view.postReady).toBe(false);
    expect(chains[1]?.dispose).toHaveBeenCalled();
    tick();
    expect(chains[1]?.render).not.toHaveBeenCalled();
  });
  it('disposes the chain with the view', async () => {
    const a = setup('high', true);
    await a.view.postReady;
    a.view.dispose();
    expect(a.chains[0]?.dispose).toHaveBeenCalled();
  });
  it('drops a chain that finishes after the view was disposed', async () => {
    const a = setup('high', true);
    a.view.dispose();
    expect(await a.view.postReady).toBe(false);
    expect(a.chains[0]?.dispose).toHaveBeenCalled();
  });
  it('survives a failed build by rendering directly', async () => {
    let run: (() => void) | null = null;
    const renderer = rendererStub();
    const view = createGameViewWith({
      tier: 'high',
      devicePixelRatio: 1,
      renderer,
      scheduler: { request: (c) => ((run = () => c(0)), 1), cancel: () => undefined },
      now: () => 0,
      createPost: () => Promise.reject(new Error('no webgl')),
    });
    expect(await view.postReady).toBe(false);
    (run as (() => void) | null)?.();
    expect(renderer.render).toHaveBeenCalled();
  });
});
