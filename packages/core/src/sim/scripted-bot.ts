import { facingToward, facingVector, livingSnails } from '../entities/snail.js';
import type { WeaponDefinition } from '../content/types.js';
import { distance } from '../math/vec3.js';
import { stepProjectile, FIXED_DT, type ProjectileState } from '../physics/ballistics.js';
import type { Snail, Vec3, Wind } from '../state/types.js';
import type { Simulation } from './simulation.js';

const ANGLES = [0.35, 0.5, 0.65, 0.8, 1.0, 1.2];
const POWER_STEPS = 24;
const MAX_FLIGHT_STEPS = 60 * 8;

/** Aim chosen by the bot's ballistic search. */
export interface BotAim {
  angle: number;
  power: number;
}

/** Closest approach (m) of an unobstructed shot to `target`, ignoring terrain. */
function missDistance(
  from: Snail,
  target: Vec3,
  weapon: WeaponDefinition,
  wind: Wind,
  aim: BotAim,
): number {
  const f = facingVector(from);
  const speed =
    weapon.launch.minSpeed + (weapon.launch.maxSpeed - weapon.launch.minSpeed) * aim.power;
  let p: ProjectileState = {
    position: { ...from.position },
    velocity: {
      x: f.x * Math.cos(aim.angle) * speed,
      y: Math.sin(aim.angle) * speed,
      z: f.z * Math.cos(aim.angle) * speed,
    },
    gravityScale: weapon.launch.gravityScale,
    windScale: weapon.launch.windScale,
  };
  let best = Infinity;
  for (let i = 0; i < MAX_FLIGHT_STEPS; i++) {
    p = stepProjectile(p, wind, FIXED_DT);
    best = Math.min(best, distance(p.position, target));
    if (p.velocity.y < 0 && p.position.y < target.y - 1) break;
  }
  return best;
}

/**
 * Brute-force search over elevation and power (deterministic, ignores terrain) for the shot
 * that passes closest to `target`.
 */
export function chooseAim(from: Snail, target: Vec3, weapon: WeaponDefinition, wind: Wind): BotAim {
  let best: BotAim = { angle: ANGLES[0] as number, power: 1 };
  let bestMiss = Infinity;
  for (const angle of ANGLES) {
    for (let i = 1; i <= POWER_STEPS; i++) {
      const aim = { angle, power: i / POWER_STEPS };
      const miss = missDistance(from, target, weapon, wind, aim);
      if (miss < bestMiss) {
        bestMiss = miss;
        best = aim;
      }
    }
  }
  return best;
}

/** Nearest living enemy, regardless of facing (the bot turns to it with its aim command). */
export function pickTarget(sim: Simulation, snail: Snail): Snail | undefined {
  const enemies = livingSnails(sim.state).filter((s) => s.teamId !== snail.teamId);
  return enemies.reduce<Snail | undefined>(
    (best, e) =>
      best === undefined ||
      distance(e.position, snail.position) < distance(best.position, snail.position)
        ? e
        : best,
    undefined,
  );
}

/**
 * Creates a scripted bot for one team. Call the returned function once per tick; it submits
 * validated commands only: aim then fire in `action` (once per turn), endTurn in `retreat`.
 */
export function createScriptedBot(
  teamId: string,
  weapon: WeaponDefinition,
): (sim: Simulation) => void {
  return (sim) => {
    const { turn } = sim.state;
    if (turn.activeTeamId !== teamId || sim.state.match.status !== 'playing') return;
    if (turn.phase === 'retreat') {
      sim.submit({ type: 'endTurn', teamId }, teamId);
      return;
    }
    const snail = livingSnails(sim.state).find((s) => s.id === turn.activeSnailId);
    if (turn.phase !== 'action' || !snail || turn.fired) return;
    const target = pickTarget(sim, snail);
    if (!target) return;
    const facing = facingToward(snail.position, target.position);
    const aim = chooseAim({ ...snail, facing }, target.position, weapon, sim.state.wind);
    const snailId = snail.id;
    if (sim.submit({ type: 'aim', snailId, facing, ...aim }, teamId).ok) {
      sim.submit({ type: 'fire', snailId, weaponId: weapon.id }, teamId);
    }
  };
}
