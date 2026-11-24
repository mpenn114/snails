import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@snails/core';
import {
  BLINK_INTERVAL,
  BLINK_TIME,
  EXPRESSION_DURATION,
  SnailExpression,
  blinkAmount,
  envelope,
  reactionPose,
  reactionsForEvent,
  scareRange,
  scareStrength,
} from './snail-expression.js';

describe('envelopes', () => {
  it('rises, holds and falls', () => {
    expect(envelope(0, 0.1, 0.5, 1)).toBe(0);
    expect(envelope(0.05, 0.1, 0.5, 1)).toBeCloseTo(0.5);
    expect(envelope(0.3, 0.1, 0.5, 1)).toBe(1);
    expect(envelope(0.75, 0.1, 0.5, 1)).toBeLessThan(1);
    expect(envelope(1, 0.1, 0.5, 1)).toBe(0);
  });

  it('blink closes then opens', () => {
    expect(blinkAmount(0)).toBe(0);
    expect(blinkAmount(BLINK_TIME * 0.4)).toBeCloseTo(1);
    expect(blinkAmount(BLINK_TIME)).toBe(0);
  });
});

describe('reactions', () => {
  it('hit squints and droops', () => {
    const p = reactionPose('hit', 0.2);
    expect(p.lid[0]).toBeGreaterThan(0.3);
    expect(p.droop).toBeGreaterThan(0.3);
  });
  it('fire widens the eyes', () => {
    const p = reactionPose('fire', 0.2);
    expect(p.stretch).toBeGreaterThan(0.8);
    expect(p.pupil).toBeLessThan(0.8);
    expect(p.lid[0]).toBe(0);
  });
  it('scare retracts the stalks and ends', () => {
    expect(reactionPose('scare', 0.3).retract).toBeGreaterThan(0.9);
    expect(reactionPose('scare', EXPRESSION_DURATION.scare).retract).toBe(0);
  });
  it('cheer and sad are distinct', () => {
    expect(reactionPose('cheer', 1).look[1]).toBeGreaterThan(0);
    expect(reactionPose('sad', 1).droop).toBeGreaterThan(0.4);
  });
  it('scales with strength', () => {
    expect(reactionPose('hit', 0.2, 0.5).droop).toBeCloseTo(reactionPose('hit', 0.2, 1).droop / 2);
  });
});

describe('event mapping', () => {
  const pos = { x: 0, y: 0, z: 0 };
  it('maps damage, firing, explosions and victory', () => {
    const dmg: SimEvent = {
      type: 'snailDamaged',
      snailId: 's',
      amount: 20,
      remaining: 5,
      sourceSnailId: null,
      cause: 'explosion',
    };
    expect(reactionsForEvent(dmg)[0]).toMatchObject({ snailId: 's', kind: 'hit' });
    const fire: SimEvent = {
      type: 'projectileFired',
      projectileId: 'p',
      weaponId: 'w',
      snailId: 's',
      position: pos,
      velocity: pos,
    };
    expect(reactionsForEvent(fire)[0]).toMatchObject({ snailId: 's', kind: 'fire' });
    const boom: SimEvent = { type: 'explosion', position: pos, radius: 3, weaponId: 'w' };
    expect(reactionsForEvent(boom)[0]).toMatchObject({ kind: 'scare', near: { radius: 3 } });
    const won: SimEvent = { type: 'matchEnded', status: 'won', winnerTeamId: 't' };
    expect(reactionsForEvent(won)[0]).toMatchObject({ teamId: 't', kind: 'cheer' });
    expect(reactionsForEvent({ type: 'matchEnded', status: 'draw' })).toEqual([]);
    expect(reactionsForEvent({ type: 'tick', tick: 1 })).toEqual([]);
  });

  it('scare strength falls with distance and vanishes out of range', () => {
    expect(scareStrength(0, 3)).toBe(1);
    expect(scareStrength(4, 3)).toBeLessThan(scareStrength(1, 3));
    expect(scareStrength(scareRange(3), 3)).toBe(0);
  });
});

describe('SnailExpression', () => {
  it('blinks periodically', () => {
    const e = new SnailExpression(5);
    let maxLid = 0;
    let blinks = 0;
    let prev = 0;
    for (let i = 0; i < 60 * 30; i++) {
      const f = e.update(1 / 60);
      maxLid = Math.max(maxLid, f.lid[0]);
      if (f.lid[0] > 0.5 && prev <= 0.5) blinks++;
      prev = f.lid[0];
    }
    expect(maxLid).toBeGreaterThan(0.9);
    expect(blinks).toBeGreaterThanOrEqual(Math.floor(30 / BLINK_INTERVAL[1]) - 1);
    expect(blinks).toBeLessThanOrEqual(Math.ceil(30 / BLINK_INTERVAL[0]));
  });

  it('plays a triggered reaction and returns to rest', () => {
    const e = new SnailExpression(9);
    e.trigger('scare');
    expect(e.busy).toBe(true);
    let peak = 0;
    for (let i = 0; i < 20; i++) peak = Math.max(peak, e.update(1 / 60).retract);
    expect(peak).toBeGreaterThan(0.9);
    for (let i = 0; i < 120; i++) e.update(1 / 60);
    expect(e.busy).toBe(false);
    expect(e.update(1 / 60).retract).toBe(0);
  });

  it('worry droops the stalks at low health', () => {
    const e = new SnailExpression(2);
    expect(e.update(0.01, 1).droop).toBeGreaterThan(0.2);
    expect(e.update(0.01, 0).droop).toBe(0);
  });
});
