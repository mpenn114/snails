import { FIXED_DT, type Command, type MatchSetup } from '@snails/core';
import type { CpuPlayer, PlannedCommand } from '@snails/ai';

/** The CPU-controlled teams of a session and how they are paced. */
export interface CpuDriverOptions {
  /** CPU player per team id. */
  players: ReadonlyMap<string, CpuPlayer>;
  /** Think time in ms before a CPU's first command of a turn. Default 1000; tests use 0. */
  thinkMs?: number;
}

interface ActivePlan {
  turnNumber: number;
  startTick: number;
  queue: PlannedCommand[];
}

/**
 * Feeds CPU teams' plans into the simulation as core commands. Each tick it checks whether a CPU
 * team has the action phase and, once per turn, asks its {@link CpuPlayer} for a plan; the plan's
 * commands are submitted at their tick offsets after the think time. Commands are filtered so a
 * CPU can only control its own team's active snail. A plan that throws or is empty ends the turn.
 */
export class CpuDriver {
  private plan: ActivePlan | null = null;
  private lastPlanned = -1;
  private readonly thinkTicks: number;

  constructor(
    private readonly match: MatchSetup,
    private readonly opts: CpuDriverOptions,
  ) {
    this.thinkTicks = Math.round((opts.thinkMs ?? 1000) / (FIXED_DT * 1000));
  }

  /** Whether `teamId` is CPU-controlled. */
  isCpu(teamId: string): boolean {
    return this.opts.players.has(teamId);
  }

  /** Plans research for every CPU team (call at each turn start). */
  planResearch(): void {
    for (const [teamId, cpu] of this.opts.players) {
      let commands: Command[] = [];
      try {
        commands = cpu.planResearch(this.match, teamId);
      } catch {
        commands = [];
      }
      for (const c of commands) {
        if ((c.type === 'queueResearch' || c.type === 'cancelResearch') && c.teamId === teamId)
          this.match.sim.submit(c, teamId);
      }
    }
  }

  /** Call once per sim step: plans on entering the action phase, submits due commands. */
  step(): void {
    const { turn, tick } = this.match.sim.state;
    const teamId = turn.activeTeamId;
    if (!teamId || turn.phase !== 'action') return;
    const cpu = this.opts.players.get(teamId);
    if (!cpu) return;
    if (this.lastPlanned !== turn.turnNumber) {
      this.lastPlanned = turn.turnNumber;
      this.plan = {
        turnNumber: turn.turnNumber,
        startTick: tick + this.thinkTicks,
        queue: this.safePlan(cpu, teamId),
      };
    }
    const plan = this.plan;
    if (!plan || plan.turnNumber !== turn.turnNumber) return;
    while (plan.queue.length > 0 && tick >= plan.startTick + (plan.queue[0]?.atTick ?? 0)) {
      const next = plan.queue.shift();
      if (next && this.allowed(next.command, teamId)) this.match.sim.submit(next.command, teamId);
    }
  }

  private safePlan(cpu: CpuPlayer, teamId: string): PlannedCommand[] {
    try {
      const commands = cpu.planTurn(this.match, teamId).commands;
      if (commands.length > 0) return [...commands].sort((a, b) => a.atTick - b.atTick);
    } catch {
      // A broken plan just ends the turn.
    }
    return [{ atTick: 0, command: { type: 'endTurn', teamId } }];
  }

  /** A CPU may only command its own team's active snail. */
  private allowed(c: Command, teamId: string): boolean {
    const active = this.match.sim.state.turn.activeSnailId;
    switch (c.type) {
      case 'move':
      case 'aim':
      case 'fire':
      case 'steer':
        return c.snailId === active;
      case 'endTurn':
        return c.teamId === teamId;
      default:
        return false;
    }
  }
}
