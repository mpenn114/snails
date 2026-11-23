import { describe, expect, it } from 'vitest';
import { createCappedScheduler, shouldRunFrame } from './frame-cap.js';
import type { FrameScheduler } from './render-loop.js';

describe('shouldRunFrame', () => {
  it('is always true when uncapped', () => {
    expect(shouldRunFrame(1, 0, 0)).toBe(true);
  });
  it('skips frames closer than the interval', () => {
    expect(shouldRunFrame(16.7, 0, 30)).toBe(false);
    expect(shouldRunFrame(33.4, 0, 30)).toBe(true);
    expect(shouldRunFrame(32, 0, 30)).toBe(true);
  });
});

function fakeBase(): { base: FrameScheduler; tick: (ms: number) => void } {
  let nextHandle = 1;
  const queue = new Map<number, (t: number) => void>();
  return {
    base: {
      request: (cb) => {
        const h = nextHandle++;
        queue.set(h, cb);
        return h;
      },
      cancel: (h) => void queue.delete(h),
    },
    tick: (ms) => {
      const cbs = [...queue.values()];
      queue.clear();
      for (const cb of cbs) cb(ms);
    },
  };
}

describe('createCappedScheduler', () => {
  it('runs every second display tick at 30 fps on 60 Hz, and all ticks when uncapped', () => {
    const f = fakeBase();
    let now = 0;
    let fps = 30;
    const s = createCappedScheduler({ base: f.base, now: () => now, getMaxFps: () => fps });
    let runs = 0;
    const frame = (): void => {
      runs++;
      s.request(frame);
    };
    s.request(frame);
    for (let i = 1; i <= 60; i++) {
      now = i * (1000 / 60);
      f.tick(now);
    }
    expect(runs).toBe(30);
    fps = 0;
    const before = runs;
    for (let i = 61; i <= 70; i++) {
      now = i * (1000 / 60);
      f.tick(now);
    }
    expect(runs - before).toBe(10);
  });

  it('cancels across skipped ticks', () => {
    const f = fakeBase();
    let now = 0;
    const s = createCappedScheduler({ base: f.base, now: () => now, getMaxFps: () => 10 });
    let runs = 0;
    let id = 0;
    s.request(() => {
      runs++;
      id = s.request(() => runs++);
    });
    now = 16;
    f.tick(now);
    now = 20;
    f.tick(now);
    s.cancel(id);
    now = 300;
    f.tick(now);
    expect(runs).toBe(1);
    s.cancel(id);
  });
});
