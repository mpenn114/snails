import { describe, expect, it } from 'vitest';
import { BatterySaverState, isLowBattery, watchBattery, type BatteryLike } from './battery-saver';

function fakeBattery(level: number, charging: boolean): BatteryLike & { fire: () => void } {
  const fns = new Set<() => void>();
  const b = {
    level,
    charging,
    addEventListener: (_t: string, fn: () => void) => void fns.add(fn),
    removeEventListener: (_t: string, fn: () => void) => void fns.delete(fn),
    fire: () => fns.forEach((f) => f()),
  };
  return b;
}

describe('isLowBattery', () => {
  it('is low only below 20% and not charging', () => {
    expect(isLowBattery(0.19, false)).toBe(true);
    expect(isLowBattery(0.2, false)).toBe(false);
    expect(isLowBattery(0.05, true)).toBe(false);
  });
});

describe('BatterySaverState', () => {
  it('reports changes only when the effective value changes', () => {
    const seen: boolean[] = [];
    const s = new BatterySaverState((a) => seen.push(a));
    s.setAuto(true);
    s.setManual(true);
    s.setAuto(false);
    expect(s.active).toBe(true);
    s.setManual(false);
    expect(seen).toEqual([true, false]);
  });

  it('a manual off beats auto until a new low-battery event', () => {
    const s = new BatterySaverState(() => undefined);
    s.setAuto(true);
    s.setManual(false);
    expect(s.active).toBe(false);
    s.setAuto(false);
    s.setAuto(true);
    expect(s.active).toBe(true);
  });
});

describe('watchBattery', () => {
  it('is a no-op without the API', async () => {
    const stop = await watchBattery({}, () => {
      throw new Error('unexpected');
    });
    stop();
  });

  it('reports low state, follows events and stops', async () => {
    const b = fakeBattery(0.5, false);
    const seen: boolean[] = [];
    const stop = await watchBattery({ getBattery: () => Promise.resolve(b) }, (l) => seen.push(l));
    b.level = 0.1;
    b.fire();
    b.charging = true;
    b.fire();
    stop();
    b.charging = false;
    b.fire();
    expect(seen).toEqual([false, true, false]);
  });

  it('tolerates a rejecting getBattery', async () => {
    const stop = await watchBattery({ getBattery: () => Promise.reject(new Error('no')) }, () => {
      throw new Error('unexpected');
    });
    stop();
  });
});
