import { describe, expect, it, vi } from 'vitest';
import { createGameViewWith } from './view.js';
import type { FrameScheduler, RenderState } from './render-loop.js';

function setup(source?: { getState(): RenderState | null }) {
  let cb: ((t: number) => void) | null = null;
  let time = 0;
  const scheduler: FrameScheduler = {
    request: (c) => {
      cb = c;
      return 1;
    },
    cancel: () => {
      cb = null;
    },
  };
  const renderer = {
    render: vi.fn(),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    dispose: vi.fn(),
  };
  const view = createGameViewWith({
    tier: 'high',
    devicePixelRatio: 3,
    renderer,
    scheduler,
    now: () => time,
    ...(source ? { source } : {}),
  });
  const tick = (ms: number): void => {
    time += ms;
    const c = cb;
    if (c) c(time);
  };
  return { view, renderer, tick, isScheduled: () => cb !== null };
}

describe('render loop', () => {
  it('calls updaters with dt and state, then renders', () => {
    const state = { snapshot: {}, alpha: 0.5 } as unknown as RenderState;
    const { view, renderer, tick } = setup({ getState: () => state });
    const fn = vi.fn();
    view.addUpdater(fn);
    tick(16);
    expect(fn).toHaveBeenCalledWith(0.016, state);
    expect(renderer.render).toHaveBeenCalledWith(view.scene, view.camera);
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(2);
  });
  it('removes updaters and passes null without source', () => {
    const { view, tick } = setup();
    const fn = vi.fn();
    const off = view.addUpdater(fn);
    tick(10);
    expect(fn).toHaveBeenCalledWith(0.01, null);
    off();
    tick(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('stop halts the loop', () => {
    const { view, renderer, tick, isScheduled } = setup();
    view.loop.stop();
    expect(view.loop.running).toBe(false);
    expect(isScheduled()).toBe(false);
    tick(16);
    expect(renderer.render).not.toHaveBeenCalled();
  });
  it('resize updates camera aspect and renderer size', () => {
    const { view, renderer } = setup();
    view.resize(800, 400);
    expect(view.camera.aspect).toBe(2);
    expect(renderer.setSize).toHaveBeenCalledWith(800, 400, false);
  });
  it('dispose disposes renderer and stops', () => {
    const { view, renderer } = setup();
    view.dispose();
    expect(renderer.dispose).toHaveBeenCalled();
    expect(view.loop.running).toBe(false);
  });
  it('exposes named root groups in the scene', () => {
    const { view } = setup();
    for (const k of ['terrain', 'entities', 'effects', 'environment'] as const) {
      expect(view.roots[k].parent).toBe(view.scene);
      expect(view.roots[k].name).toBe(k);
    }
  });
});
