import { facingToward, Rng, type Command, type MatchSetup, type Snail } from '@snails/core';
import { BallisticSolverStrategy } from '../strategies.js';
import { chooseWeapon } from '../weapon-choice.js';
import type { CpuConfig, CpuPlayer, TurnPlan } from './types.js';

function flatDistance(a: Snail, b: Snail): number {
  return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
}

/**
 * Baseline CPU (placeholder until the solver, targeting and difficulty work lands): shoots the
 * nearest enemy with a flat-ground ballistic guess and never researches.
 */
class BaselineCpu implements CpuPlayer {
  private readonly rng: Rng;

  constructor(readonly config: CpuConfig) {
    this.rng = new Rng(config.seed);
  }

  planTurn(match: MatchSetup, teamId: string): TurnPlan {
    const state = match.sim.state;
    const team = state.teams.find((t) => t.id === teamId);
    const snail = team?.snails.find((s) => s.id === state.turn.activeSnailId);
    const weapon = team ? chooseWeapon(team, match.weapons.list()) : null;
    const end: TurnPlan = { commands: [{ atTick: 0, command: { type: 'endTurn', teamId } }] };
    if (!team || !snail || !weapon) return end;
    const target = state.teams
      .filter((t) => t.id !== teamId)
      .flatMap((t) => t.snails.filter((s) => s.alive))
      .sort((a, b) => flatDistance(a, snail) - flatDistance(b, snail))[0];
    if (!target) return end;
    const shot = new BallisticSolverStrategy().chooseShot({
      origin: { x: 0, y: snail.position.y + 0.5, z: 0 },
      target: { x: flatDistance(target, snail), y: target.position.y, z: 0 },
      wind: 0,
      maxSpeed: weapon.launch?.maxSpeed ?? 20,
    });
    const angle = shot.angle + this.rng.range(-0.08, 0.08);
    const power = Math.min(1, Math.max(0.1, shot.power + this.rng.range(-0.08, 0.08)));
    const facing = facingToward(snail.position, target.position);
    const aim: Command = { type: 'aim', snailId: snail.id, angle, power, facing };
    const fire: Command = { type: 'fire', snailId: snail.id, weaponId: weapon.id };
    return {
      commands: [
        { atTick: 0, command: aim },
        { atTick: 30, command: fire },
      ],
    };
  }

  planResearch(): Command[] {
    return [];
  }
}

/** Creates the CPU player for `config`. */
export function createCpuPlayer(config: CpuConfig): CpuPlayer {
  return new BaselineCpu(config);
}
