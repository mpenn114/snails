import { Rng, stepProjectile } from '@snails/core';
import type { AimContext, CpuPlayer, Shot } from './cpu-player.js';

/** Easiest CPU: aims randomly. */
export class RandomAimStrategy implements CpuPlayer {
  /** @param rng - Seeded RNG for determinism. */
  constructor(private readonly rng: Rng) {}

  /** Picks a random angle and power. */
  chooseShot(): Shot {
    return { angle: this.rng.range(0.1, 1.4), power: this.rng.range(0.2, 1) };
  }
}

/** Simulates a shot and returns the miss distance to the target on the ground plane. */
export function simulateMiss(ctx: AimContext, shot: Shot): number {
  const dir = Math.sign(ctx.target.x - ctx.origin.x) || 1;
  const speed = shot.power * ctx.maxSpeed;
  let s = {
    position: { ...ctx.origin },
    velocity: { x: dir * Math.cos(shot.angle) * speed, y: Math.sin(shot.angle) * speed, z: 0 },
  };
  for (let i = 0; i < 1200 && s.position.y >= ctx.target.y; i++) {
    s = stepProjectile(s, ctx.wind);
  }
  return Math.abs(s.position.x - ctx.target.x);
}

/** Brute-force angle/power search over core ballistics (stub; ignores terrain). */
export class BallisticSolverStrategy implements CpuPlayer {
  /** Searches a coarse angle/power grid for the smallest miss distance. */
  chooseShot(ctx: AimContext): Shot {
    let best: Shot = { angle: Math.PI / 4, power: 1 };
    let bestMiss = Infinity;
    for (let a = 0.1; a <= 1.5; a += 0.05) {
      for (let p = 0.2; p <= 1; p += 0.05) {
        const miss = simulateMiss(ctx, { angle: a, power: p });
        if (miss < bestMiss) {
          bestMiss = miss;
          best = { angle: a, power: p };
        }
      }
    }
    return best;
  }
}
