import { buildMatchContent, type MatchContent } from '../content/match-content.js';
import type { AreaDefinition, StatusDefinition, WeaponDefinition } from '../content/types.js';
import { RngStreams } from '../rng-streams.js';
import { createInitialState } from '../state/game-state.js';
import { SdfGrid } from '../terrain/sdf-grid.js';
import { FIXED_DT } from '../physics/ballistics.js';
import type { SimEvent } from './events.js';
import type { SimContext } from './types.js';
import type { EffectContext } from '../content/match-content.js';
import type { Vec3 } from '../state/types.js';

/** A hand-built context for unit tests: flat ground at y = 5, two teams, event capture. */
export interface TestCtx {
  ctx: EffectContext;
  events: SimEvent[];
  content: MatchContent;
}

/** Options for {@link makeTestCtx}. */
export interface TestCtxOptions {
  weapons?: WeaponDefinition[];
  statuses?: StatusDefinition[];
  areas?: AreaDefinition[];
  /** Snail positions: team `a` gets the first, team `b` the second (defaults along x). */
  positions?: Vec3[];
}

/** Builds a flat-terrain context with snails `a1`/`b1` (and optional `a2`/`b2` from more positions). */
export function makeTestCtx(opts: TestCtxOptions = {}): TestCtx {
  const grid = new SdfGrid(40, 40, 40, 1);
  for (let z = 0; z < 40; z++)
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) grid.data[grid.index(x, y, z)] = y - 5.5;
  const at = opts.positions ?? [
    { x: 10, y: 6, z: 20 },
    { x: 20, y: 6, z: 20 },
  ];
  const state = createInitialState({
    seed: 1,
    teams: [
      { id: 'a', name: 'A', colour: '#f00', snails: [{ id: 'a1', name: 'A1', position: at[0] }] },
      { id: 'b', name: 'B', colour: '#00f', snails: [{ id: 'b1', name: 'B1', position: at[1] }] },
    ],
    terrain: { nx: 40, ny: 40, nz: 40 },
  });
  const events: SimEvent[] = [];
  const content = buildMatchContent({
    weapons: opts.weapons ?? [],
    ...(opts.statuses ? { statuses: opts.statuses } : {}),
    ...(opts.areas ? { areas: opts.areas } : {}),
  });
  const base: SimContext = {
    state,
    terrain: grid,
    rng: new RngStreams(1),
    dt: FIXED_DT,
    emit: (e) => events.push(e),
  };
  return { ctx: { ...base, content }, events, content };
}
