import {
  FIXED_DT,
  createMatch,
  createScriptedBot,
  type GameSnapshot,
  type MatchOptions,
  type SdfGrid,
  type SimEvent,
  type Simulation,
  type WeaponDefinition,
} from '@snails/core';
import { TEAM_COLORS, hexToCss } from '@snails/render';

/** Weapon used by the harness bots: infinite-ammo lob with a big crater. */
export const HARNESS_WEAPON: WeaponDefinition = {
  id: 'harness:lobber',
  name: 'Lobber',
  kind: 'projectile',
  launch: { minSpeed: 5, maxSpeed: 24, gravityScale: 1, windScale: 1, projectileRadius: 0.15 },
  fuseSeconds: 0,
  explosion: { radius: 4, maxDamage: 45, knockback: 6, falloff: 'linear' },
  ammo: 'infinite',
};

const TEAM_COLOURS = TEAM_COLORS.map(hexToCss);

const SNAIL_NAMES = ['Gary', 'Turbo', 'Slimy', 'Dash', 'Mossy', 'Pebble', 'Nacho', 'Bramble'];

const snailName = (i: number): string =>
  `${SNAIL_NAMES[i % SNAIL_NAMES.length] as string}${i >= SNAIL_NAMES.length ? ' ' + (Math.floor(i / SNAIL_NAMES.length) + 1) : ''}`;

/** Options for {@link harnessMatchOptions}. */
export interface HarnessMatchOptions {
  seed: number;
  teams?: number;
  snailsPerTeam?: number;
}

/** Builds match options for `teams` x `snailsPerTeam` snails on a large seeded island. */
export function harnessMatchOptions(o: HarnessMatchOptions): MatchOptions {
  const teams = Math.max(2, o.teams ?? 4);
  const per = Math.max(1, o.snailsPerTeam ?? 4);
  return {
    seed: o.seed,
    teams: Array.from({ length: teams }, (_, t) => ({
      id: `t${t}`,
      name: `Team ${t + 1}`,
      colour: TEAM_COLOURS[t % TEAM_COLOURS.length] as string,
      snailNames: Array.from({ length: per }, (_, i) => snailName(t * per + i)),
    })),
    terrain: { nx: 160, ny: 48, nz: 160, caveDensity: 0.1 },
    turn: { introDuration: 0.5, retreatDuration: 1, maxTurns: 200 },
    weapons: [HARNESS_WEAPON],
  };
}

/** Sinks the fake server feeds, mirroring the network messages the real display receives. */
export interface HarnessSink {
  onInit(init: { grid: SdfGrid; waterLevel: number }): void;
  onSnapshot(snapshot: GameSnapshot): void;
  onEvents(events: readonly SimEvent[]): void;
}

/** A local stand-in for the game server: runs a bot match and streams it to a sink. */
export interface FakeServer {
  /** Advances real time by `dtSeconds` (scaled by speed), stepping the sim at the fixed rate. */
  advance(dtSeconds: number): void;
  /** Number of sim ticks run so far (all matches). */
  readonly ticks: number;
  /** Current simulation. */
  readonly sim: Simulation;
}

/** Options for {@link createFakeServer}. */
export interface FakeServerOptions extends HarnessMatchOptions {
  sink: HarnessSink;
  /** Sim speed multiplier (default 1). */
  speed?: number;
  /** Send a snapshot every N ticks (default 3, i.e. 20 Hz). */
  snapshotEvery?: number;
}

/** Most sim ticks run per `advance` call, so a slow frame cannot spiral. */
const MAX_TICKS_PER_ADVANCE = 240;

/**
 * Creates the fake server: builds a match, sends init, then on every `advance` steps the sim
 * with scripted bots and pushes snapshots and events. Restarts with the next seed when a match
 * ends.
 */
export function createFakeServer(opts: FakeServerOptions): FakeServer {
  const speed = opts.speed ?? 1;
  const every = Math.max(1, opts.snapshotEvery ?? 3);
  let seed = opts.seed;
  let acc = 0;
  let ticks = 0;
  let bots: ((s: Simulation) => void)[] = [];

  function build(): Simulation {
    const options = harnessMatchOptions({ ...opts, seed });
    const m = createMatch(options);
    bots = options.teams.map((t) => createScriptedBot(t.id, HARNESS_WEAPON));
    opts.sink.onInit({ grid: m.sim.terrain, waterLevel: m.sim.state.terrain.waterLevel });
    opts.sink.onSnapshot(m.sim.snapshot());
    return m.sim;
  }

  let sim = build();

  function tick(): void {
    for (const bot of bots) bot(sim);
    const events = sim.step(FIXED_DT);
    ticks++;
    opts.sink.onEvents(events);
    if (sim.state.tick % every === 0) opts.sink.onSnapshot(sim.snapshot());
    if (sim.state.match.status !== 'playing') {
      seed++;
      sim = build();
    }
  }

  return {
    advance(dtSeconds) {
      acc += Math.min(dtSeconds, 0.25) * speed;
      let n = 0;
      while (acc >= FIXED_DT && n < MAX_TICKS_PER_ADVANCE) {
        acc -= FIXED_DT;
        n++;
        tick();
      }
      if (n === MAX_TICKS_PER_ADVANCE) acc = 0;
    },
    get ticks() {
      return ticks;
    },
    get sim() {
      return sim;
    },
  };
}
