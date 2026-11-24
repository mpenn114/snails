import { describe, expect, it } from 'vitest';
import {
  SnailAnimator,
  ZERO_DELTA,
  aimPose,
  crawlPose,
  crawlWeight,
  hurtPose,
  idlePose,
  jumpPose,
  mixPoses,
  retreatPose,
  toBodyPose,
  type AnimInput,
} from './snail-anim.js';

const still: AnimInput = {
  speed: 0,
  vy: 0,
  grounded: true,
  aiming: false,
  aimAngle: 0,
  retreating: false,
};

describe('pose functions', () => {
  it('idle breathes within a few percent and is periodic', () => {
    for (let t = 0; t < 10; t += 0.37) {
      const p = idlePose(t);
      expect(Math.abs(p.sy)).toBeLessThan(0.03);
      expect(Math.abs(p.stalkSway)).toBeLessThan(0.15);
    }
    expect(idlePose(0).sy).toBeCloseTo(idlePose(3.2).sy, 6);
  });

  it('crawl alternates stretch and contraction with roughly constant volume', () => {
    expect(crawlPose(Math.PI / 2).sx).toBeGreaterThan(0.05);
    expect(crawlPose(-Math.PI / 2).sx).toBeLessThan(-0.05);
    const p = crawlPose(Math.PI / 2);
    const vol = (1 + p.sx) * (1 + p.sy) * (1 + p.sz);
    expect(Math.abs(vol - 1)).toBeLessThan(0.05);
  });

  it('crawl weight ramps with speed', () => {
    expect(crawlWeight(0)).toBe(0);
    expect(crawlWeight(5)).toBe(1);
    expect(crawlWeight(0.5)).toBeGreaterThan(0);
    expect(crawlWeight(0.5)).toBeLessThan(1);
  });

  it('aim lean follows elevation, clamped', () => {
    expect(aimPose(1).lean).toBeGreaterThan(aimPose(0).lean);
    expect(aimPose(100).lean).toBe(aimPose(1.4).lean);
    expect(aimPose(1).stalkTilt).toBeLessThan(0);
  });

  it('jump stretches tall, more when rising than falling', () => {
    expect(jumpPose(8).sy).toBeGreaterThan(0.15);
    expect(jumpPose(-8).sy).toBeLessThan(jumpPose(8).sy);
    expect(jumpPose(8).sx).toBeLessThan(0);
    expect(jumpPose(0).sy).toBe(0);
  });

  it('hurt squashes and fades out with the impulse', () => {
    expect(hurtPose(1, 0).sy).toBeLessThan(-0.2);
    expect(hurtPose(1, 0).sx).toBeGreaterThan(0);
    expect(Math.abs(hurtPose(0, 1).sy)).toBe(0);
  });

  it('retreat is low and hunched', () => {
    expect(retreatPose().sy).toBeLessThan(0);
    expect(retreatPose().stalkTilt).toBeLessThan(0);
  });

  it('mixes weighted poses and clamps scales', () => {
    const m = mixPoses([
      [{ ...ZERO_DELTA, sy: 0.2 }, 0.5],
      [{ ...ZERO_DELTA, sy: 0.2 }, 0],
    ]);
    expect(m.sy).toBeCloseTo(0.1);
    expect(toBodyPose({ ...ZERO_DELTA, sy: -5 }).scaleY).toBe(0.6);
    expect(toBodyPose({ ...ZERO_DELTA, sx: 5 }).scaleX).toBe(1.5);
  });
});

describe('SnailAnimator', () => {
  it('rests near scale 1 when still', () => {
    const a = new SnailAnimator(0.3);
    let p = a.update(0.016, still);
    for (let i = 0; i < 200; i++) p = a.update(0.016, still);
    expect(p.scaleY).toBeGreaterThan(0.97);
    expect(p.scaleY).toBeLessThan(1.03);
  });

  it('crawls with a visible squash wave when moving', () => {
    const a = new SnailAnimator();
    let lo = 9;
    let hi = 0;
    for (let i = 0; i < 240; i++) {
      const p = a.update(0.016, { ...still, speed: 1.2 });
      if (i > 60) {
        lo = Math.min(lo, p.scaleX);
        hi = Math.max(hi, p.scaleX);
      }
    }
    expect(hi - lo).toBeGreaterThan(0.08);
  });

  it('hit triggers a squash that recovers', () => {
    const a = new SnailAnimator();
    for (let i = 0; i < 100; i++) a.update(0.016, still);
    a.hit(1);
    const p = a.update(0.016, still);
    expect(p.scaleY).toBeLessThan(0.85);
    let q = p;
    for (let i = 0; i < 200; i++) q = a.update(0.016, still);
    expect(q.scaleY).toBeGreaterThan(0.96);
  });

  it('stretches in the air and squashes on landing', () => {
    const a = new SnailAnimator();
    for (let i = 0; i < 30; i++) a.update(0.016, { ...still, grounded: false, vy: 8 });
    const air = a.update(0.016, { ...still, grounded: false, vy: 8 });
    expect(air.scaleY).toBeGreaterThan(1.12);
    const land = a.update(0.016, { ...still, grounded: true, vy: 0 });
    expect(land.scaleY).toBeLessThan(air.scaleY);
  });

  it('leans while aiming and hunches while retreating', () => {
    const a = new SnailAnimator();
    let aim = a.update(0, still);
    for (let i = 0; i < 60; i++) aim = a.update(0.016, { ...still, aiming: true, aimAngle: 1 });
    expect(aim.lean).toBeGreaterThan(0.1);
    const b = new SnailAnimator();
    let ret = b.update(0, still);
    for (let i = 0; i < 60; i++) ret = b.update(0.016, { ...still, retreating: true });
    expect(ret.lean).toBeLessThan(-0.05);
  });

  it('survives zero and huge dt', () => {
    const a = new SnailAnimator();
    expect(Number.isFinite(a.update(0, still).scaleX)).toBe(true);
    expect(Number.isFinite(a.update(1e9, still).scaleX)).toBe(true);
  });
});
