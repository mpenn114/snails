/**
 * Procedural body animation of a snail (M7-08). Everything here is a pure parameter function of
 * time and a few motion facts; {@link SnailAnimator} adds the smoothing and impulse state. The
 * result is applied by SnailMesh to the squash group and the stalk pivots. Cosmetic only: it
 * never feeds back into the simulation.
 */

/** Deltas around the rest pose (scales are deltas from 1). Sums of weighted poses are valid. */
export interface PoseDelta {
  /** Scale deltas along the body axis (x), up (y) and across (z). */
  sx: number;
  sy: number;
  sz: number;
  /** Pitch about the body's side axis in radians; positive raises the head. */
  lean: number;
  /** Extra lift of the whole body in metres. */
  lift: number;
  /** Stalk forward bend in radians; positive bends forward and down, negative leans back. */
  stalkTilt: number;
  /** Stalk sideways sway in radians. */
  stalkSway: number;
  /** Shell rock about the side axis in radians (the shell lags behind the body). */
  shellRock: number;
}

/** The absolute pose handed to the mesh: full scales plus the other channels. */
export interface BodyPose extends PoseDelta {
  /** Absolute scale along x. */
  scaleX: number;
  /** Absolute scale along y. */
  scaleY: number;
  /** Absolute scale along z. */
  scaleZ: number;
}

/** Facts the animation reads each frame (all derived from the view and its history). */
export interface AnimInput {
  /** Horizontal speed in m/s. */
  speed: number;
  /** Vertical speed in m/s (positive up). */
  vy: number;
  /** Resting on the ground. */
  grounded: boolean;
  /** Active snail in the aiming part of its turn. */
  aiming: boolean;
  /** Aim elevation above the facing direction in radians. */
  aimAngle: number;
  /** Active snail retreating after its shot. */
  retreating: boolean;
}

/** An all-zero delta. */
export const ZERO_DELTA: Readonly<PoseDelta> = {
  sx: 0,
  sy: 0,
  sz: 0,
  lean: 0,
  lift: 0,
  stalkTilt: 0,
  stalkSway: 0,
  shellRock: 0,
};

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Speed (m/s) below which the snail counts as standing, and above which it fully crawls. */
export const CRAWL_SPEED_RANGE: readonly [number, number] = [0.15, 0.9];
/** Crawl cycle frequency in Hz at 1 m/s (stride rate rises with speed, within bounds). */
export const CRAWL_HZ = 1.6;

/** Idle breathing and gentle stalk sway; `t` in seconds, `seed` offsets the phase per snail. */
export function idlePose(t: number, seed = 0): PoseDelta {
  const breath = Math.sin((t / 3.2 + seed) * TAU);
  return {
    ...ZERO_DELTA,
    sy: 0.018 * breath,
    sx: -0.008 * breath,
    sz: 0.008 * breath,
    stalkSway: 0.09 * Math.sin((t / 2.7 + seed * 1.7) * TAU),
    stalkTilt: 0.05 * Math.sin((t / 3.9 + seed * 0.6 + 0.25) * TAU),
    shellRock: 0.01 * breath,
  };
}

/** Crawl squash and stretch for a cycle `phase` in radians (extend, then contract). */
export function crawlPose(phase: number): PoseDelta {
  const w = Math.sin(phase);
  return {
    ...ZERO_DELTA,
    sx: 0.075 * w,
    sy: -0.055 * w,
    sz: -0.02 * w,
    lean: 0.035 * Math.cos(phase),
    lift: 0,
    stalkTilt: 0.12 * Math.sin(phase - 1),
    stalkSway: 0.05 * Math.sin(phase * 2),
    shellRock: -0.05 * Math.cos(phase),
  };
}

/** Aim lean: the head rises with the elevation and the stalks lean back to look up. */
export function aimPose(angle: number): PoseDelta {
  const a = clamp(angle, -0.6, 1.4);
  return {
    ...ZERO_DELTA,
    sy: 0.03,
    lean: 0.22 * a,
    stalkTilt: -0.18 * a - 0.05,
    shellRock: -0.05 * a,
  };
}

/** Jump: stretch tall while rising, a little less while falling, head lead and trailing shell. */
export function jumpPose(vy: number): PoseDelta {
  const up = clamp(Math.abs(vy) / 9, 0, 1);
  const stretch = 0.26 * up * (vy >= 0 ? 1 : 0.7);
  return {
    ...ZERO_DELTA,
    sy: stretch,
    sx: -stretch * 0.4,
    sz: -stretch * 0.4,
    lean: clamp(vy * 0.04, -0.35, 0.35),
    stalkTilt: -clamp(vy * 0.05, -0.4, 0.5),
    shellRock: clamp(vy * 0.03, -0.25, 0.25),
  };
}

/** Hurt squash for impulse `k` (1 = just hit, decays to 0) at time `t`, with a quick shiver. */
export function hurtPose(k: number, t: number): PoseDelta {
  return {
    ...ZERO_DELTA,
    sy: -0.24 * k,
    sx: 0.14 * k,
    sz: 0.14 * k,
    lean: -0.08 * k,
    stalkTilt: 0.3 * k,
    stalkSway: 0.22 * k * Math.sin(t * 42),
    shellRock: 0.12 * k * Math.sin(t * 36),
  };
}

/** Landing squash for impulse `k` (1 = hard landing, decays to 0). */
export function landPose(k: number): PoseDelta {
  return { ...ZERO_DELTA, sy: -0.2 * k, sx: 0.12 * k, sz: 0.12 * k, stalkTilt: 0.2 * k };
}

/** Retreat: hunched low, shell rocking and the stalks laid back while hurrying away. */
export function retreatPose(): PoseDelta {
  return { ...ZERO_DELTA, sy: -0.07, sx: 0.05, sz: 0.03, lean: -0.1, stalkTilt: -0.5 };
}

/** Sums `poses` weighted by their weights. */
export function mixPoses(parts: readonly (readonly [PoseDelta, number])[]): PoseDelta {
  const out = { ...ZERO_DELTA };
  for (const [p, w] of parts) {
    if (w === 0) continue;
    out.sx += p.sx * w;
    out.sy += p.sy * w;
    out.sz += p.sz * w;
    out.lean += p.lean * w;
    out.lift += p.lift * w;
    out.stalkTilt += p.stalkTilt * w;
    out.stalkSway += p.stalkSway * w;
    out.shellRock += p.shellRock * w;
  }
  return out;
}

/** Turns a delta into the absolute pose (scales around 1, kept in a sane range). */
export function toBodyPose(d: PoseDelta): BodyPose {
  const lim = (v: number): number => clamp(1 + v, 0.6, 1.5);
  return { ...d, scaleX: lim(d.sx), scaleY: lim(d.sy), scaleZ: lim(d.sz) };
}

/** Weight 0..1 of the crawl cycle for a ground speed. */
export function crawlWeight(speed: number): number {
  return smoothstep(CRAWL_SPEED_RANGE[0], CRAWL_SPEED_RANGE[1], speed);
}

/** Per-snail animation state: smoothed blend weights, crawl phase and hurt/land impulses. */
export class SnailAnimator {
  private time = 0;
  private phase = 0;
  private crawl = 0;
  private aim = 0;
  private air = 0;
  private retreat = 0;
  private hurt = 0;
  private hurtTime = 0;
  private land = 0;
  private wasGrounded = true;
  private airVy = 0;
  private readonly seed: number;

  /** @param seed - Per-snail phase offset in 0..1 so idle motion is not in lockstep. */
  constructor(seed = 0) {
    this.seed = seed - Math.floor(seed);
  }

  /** Triggers the hurt squash with strength 0..1. */
  hit(strength = 1): void {
    this.hurt = Math.max(this.hurt, clamp(strength, 0, 1));
    this.hurtTime = 0;
  }

  /** Triggers the landing squash with strength 0..1. */
  landed(strength = 1): void {
    this.land = Math.max(this.land, clamp(strength, 0, 1));
  }

  /** Advances by `dt` seconds and returns the pose for the current facts. */
  update(dt: number, input: AnimInput): BodyPose {
    const d = clamp(dt, 0, 0.1);
    this.time += d;
    const ease = (cur: number, target: number, rate: number): number =>
      cur + (target - cur) * (1 - Math.exp(-rate * d));
    const walking = input.grounded ? crawlWeight(input.speed) : 0;
    this.crawl = ease(this.crawl, walking, 9);
    this.air = ease(this.air, input.grounded ? 0 : 1, 14);
    this.aim = ease(this.aim, input.aiming && input.grounded ? 1 : 0, 7);
    this.retreat = ease(this.retreat, input.retreating ? 1 : 0, 6);
    this.phase +=
      d * TAU * CRAWL_HZ * (0.6 + Math.min(input.speed, 2.5) * (input.retreating ? 0.9 : 0.6));
    if (!input.grounded) this.airVy = Math.max(this.airVy, Math.abs(input.vy));
    if (input.grounded && !this.wasGrounded) this.landed(clamp(this.airVy / 8, 0.25, 1));
    if (input.grounded) this.airVy = 0;
    this.wasGrounded = input.grounded;
    this.hurt *= Math.exp(-4.5 * d);
    this.hurtTime += d;
    this.land *= Math.exp(-7 * d);
    const still = 1 - Math.max(this.crawl, this.air);
    return toBodyPose(
      mixPoses([
        [idlePose(this.time, this.seed), still],
        [crawlPose(this.phase), this.crawl],
        [aimPose(input.aimAngle), this.aim],
        [jumpPose(input.vy), this.air],
        [retreatPose(), this.retreat],
        [hurtPose(this.hurt, this.hurtTime), 1],
        [landPose(this.land), 1],
      ]),
    );
  }
}
