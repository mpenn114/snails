import { describe, expect, it } from 'vitest';
import {
  CHARGE_FULL_MS,
  CHARGE_MIN_HOLD_MS,
  CHARGE_TICK_MS,
  chargePower,
  createFireCharge,
  powerLabel,
} from './fire-charge';
import type { ChargeMessage } from './fire-charge';

function rig(needs = true) {
  let t = 0;
  let tick: (() => void) | null = null;
  const sent: ChargeMessage[] = [];
  const ends: boolean[] = [];
  const c = createFireCharge({
    now: () => t,
    send: (m) => sent.push(m),
    needsCharge: () => needs,
    angle: () => 0.5,
    onCharge: () => undefined,
    onEnd: (f) => ends.push(f),
    every: (fn) => {
      tick = fn;
      return () => (tick = null);
    },
  });
  return {
    c,
    sent,
    ends,
    advance(ms: number) {
      t += ms;
      tick?.();
    },
    wait(ms: number) {
      t += ms;
    },
    get ticking() {
      return tick !== null;
    },
  };
}

describe('chargePower', () => {
  it('fills linearly and clamps', () => {
    expect(chargePower(0)).toBe(0);
    expect(chargePower(-5)).toBe(0);
    expect(chargePower(CHARGE_FULL_MS / 2)).toBeCloseTo(0.5);
    expect(chargePower(CHARGE_FULL_MS * 3)).toBe(1);
    expect(chargePower(Number.NaN)).toBe(0);
  });
  it('labels as percent', () => {
    expect(powerLabel(0.644)).toBe('64%');
    expect(powerLabel(2)).toBe('100%');
  });
});

describe('createFireCharge', () => {
  it('relays live power then sends the final aim before fire', () => {
    const r = rig();
    r.c.press();
    expect(r.c.charging).toBe(true);
    r.advance(CHARGE_TICK_MS);
    expect(r.sent[0]).toMatchObject({ type: 'aim' });
    r.wait(CHARGE_FULL_MS / 2 - CHARGE_TICK_MS);
    r.c.release();
    const types = r.sent.map((m) => m.type);
    expect(types.at(-2)).toBe('aim');
    expect(types.at(-1)).toBe('fire');
    const last = r.sent.at(-2) as { power: number; angle: number };
    expect(last.power).toBeCloseTo(0.5);
    expect(last.angle).toBe(0.5);
    expect(r.ends).toEqual([true]);
    expect(r.ticking).toBe(false);
    expect(r.c.charging).toBe(false);
  });
  it('caps at full power when held long', () => {
    const r = rig();
    r.c.press();
    r.wait(10_000);
    r.c.release();
    expect((r.sent.at(-2) as { power: number }).power).toBe(1);
  });
  it('a short tap does not fire', () => {
    const r = rig();
    r.c.press();
    r.wait(CHARGE_MIN_HOLD_MS - 1);
    r.c.release();
    expect(r.sent.some((m) => m.type === 'fire')).toBe(false);
    expect(r.ends).toEqual([false]);
  });
  it('cancel aborts without firing', () => {
    const r = rig();
    r.c.press();
    r.wait(1000);
    r.c.cancel();
    r.c.release();
    expect(r.sent.some((m) => m.type === 'fire')).toBe(false);
    expect(r.ends).toEqual([false]);
  });
  it('weapons without power fire on release with no aim', () => {
    const r = rig(false);
    r.c.press();
    r.c.release();
    expect(r.sent).toEqual([{ type: 'fire' }]);
  });
});
