import { describe, expect, it } from 'vitest';
import type { CrateDefinition, StatusDefinition } from '../content/types.js';
import { resolveExplosion } from '../physics/explosion.js';
import type { SimEvent } from '../sim/events.js';
import { createMatch, type MatchSetup } from '../sim/match.js';
import { testMatchOptions } from '../sim/test-match.js';
import type { SimContext } from '../sim/types.js';
import type { Crate, Vec3 } from '../state/types.js';
import { rayCast } from '../terrain/collision.js';
import { isDropTurn, roundOf } from './crate-drop.js';
import {
  CRATE_RADIUS,
  DEFAULT_CRATE_RULES,
  MIN_SNAIL_DISTANCE,
  PARACHUTE_SPEED,
} from './crate-rules.js';

const HEALTH: CrateDefinition = {
  id: 't:health',
  name: 'Health',
  kind: 'health',
  weight: 1,
  contents: { heal: 25 },
};
const SUPPLY: CrateDefinition = {
  id: 't:supply',
  name: 'Supply',
  kind: 'supply',
  weight: 1,
  contents: { weapons: [{ weaponId: 'test:pebble-toss', count: 3 }] },
};
const MYSTERY: CrateDefinition = {
  id: 't:mystery',
  name: 'Mystery',
  kind: 'mystery',
  weight: 1,
  contents: { heal: 30, weapons: [{ weaponId: 'test:pebble-toss', count: 2 }], statusId: 't:goo' },
};
const GOO: StatusDefinition = {
  id: 't:goo',
  name: 'Goo',
  moveSpeedMultiplier: 0.5,
  defaultTurns: 2,
};
const EVERY_ROUND = { crateRules: { intervalRounds: 1 } };

function match(seed: number, crates: CrateDefinition[], extra = {}): MatchSetup {
  return createMatch({ ...testMatchOptions(seed), crates, statuses: [GOO], ...extra });
}

function ctxOf(m: MatchSetup, events: SimEvent[]): SimContext {
  const { sim } = m;
  return {
    state: sim.state,
    terrain: sim.terrain,
    rng: sim.rng,
    dt: 1 / 60,
    emit: (e) => events.push(e),
  };
}

/** Plays turns by ending each as soon as the action phase starts; returns all events. */
function playTurns(m: MatchSetup, untilTurn: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < 200000 && m.sim.state.turn.turnNumber < untilTurn; i++) {
    if (m.sim.state.turn.phase === 'action' && m.sim.state.turn.activeTeamId) {
      m.sim.enqueue({ type: 'endTurn', teamId: m.sim.state.turn.activeTeamId });
    }
    events.push(...m.sim.step());
  }
  return events;
}

function putCrate(m: MatchSetup, defId: string, at: Vec3): Crate {
  const crate: Crate = {
    id: `c${m.sim.state.nextCrateId++}`,
    defId,
    position: { ...at },
    velocity: { x: 0, y: 0, z: 0 },
    grounded: true,
  };
  m.sim.state.crates.push(crate);
  return crate;
}

function firstSnail(m: MatchSetup) {
  const s = m.sim.state.teams[0]?.snails[0];
  if (!s) throw new Error('no snail');
  return s;
}

describe('crate drop schedule', () => {
  it('counts rounds as one turn per team and drops on every third round', () => {
    const m = match(1, [HEALTH]);
    const { state } = m.sim;
    const dropTurns: number[] = [];
    for (let t = 1; t <= 14; t++) {
      state.turn.turnNumber = t;
      if (isDropTurn(state, DEFAULT_CRATE_RULES)) dropTurns.push(t);
    }
    expect(roundOf(state)).toBe(7);
    expect(dropTurns).toEqual([5, 11]);
  });

  it('spawns the first crate at the start of round 3 (turn 5 with two teams)', () => {
    const m = match(2, [HEALTH]);
    const events = playTurns(m, 7);
    const spawns = events.filter((e) => e.type === 'crateSpawned');
    expect(spawns).toHaveLength(1);
    expect(m.sim.state.crates).toHaveLength(1);
    const turn5 = events.findIndex((e) => e.type === 'turnStarted' && e.turnNumber === 5);
    expect(turn5).toBeGreaterThan(-1);
    expect(events.findIndex((e) => e.type === 'crateSpawned')).toBeGreaterThan(turn5);
  });

  it('never keeps more than two crates on the map', () => {
    const m = match(3, [HEALTH], EVERY_ROUND);
    playTurns(m, 16);
    expect(m.sim.state.crates).toHaveLength(2);
  });

  it('drops nothing when no crate definition can drop', () => {
    const m = match(3, []);
    playTurns(m, 7);
    expect(m.sim.state.crates).toHaveLength(0);
  });
});

describe('crate placement and falling', () => {
  const run = (seed: number): Vec3[] => {
    const m = match(seed, [HEALTH], EVERY_ROUND);
    playTurns(m, 4);
    return m.sim.state.crates.map((c) => c.position);
  };

  it('is deterministic for a seed and differs between seeds', () => {
    expect(run(11)).toEqual(run(11));
    expect(run(11)).not.toEqual(run(12));
  });

  it('lands on dry solid ground away from snails', () => {
    const m = match(21, [HEALTH], EVERY_ROUND);
    playTurns(m, 4);
    const crate = m.sim.state.crates[0];
    if (!crate) throw new Error('no crate');
    expect(crate.grounded).toBe(true);
    const from = { ...crate.position, y: crate.position.y + 1 };
    const down = rayCast(m.sim.terrain, from, { x: 0, y: -1, z: 0 }, 3);
    expect(down).not.toBeNull();
    expect(crate.position.y - (down?.point.y ?? 0)).toBeLessThan(CRATE_RADIUS + 0.2);
    expect(down?.point.y ?? 0).toBeGreaterThan(m.sim.state.terrain.waterLevel + 1);
    for (const s of m.sim.state.teams.flatMap((t) => t.snails)) {
      const d = Math.hypot(s.position.x - crate.position.x, s.position.z - crate.position.z);
      expect(d).toBeGreaterThan(MIN_SNAIL_DISTANCE - 1);
    }
  });

  it('parachutes down slowly and falls again when the ground is carved away', () => {
    const m = match(22, [HEALTH], EVERY_ROUND);
    for (let i = 0; i < 3000 && m.sim.state.crates.length === 0; i++) {
      if (m.sim.state.turn.phase === 'action' && m.sim.state.turn.activeTeamId) {
        m.sim.enqueue({ type: 'endTurn', teamId: m.sim.state.turn.activeTeamId });
      }
      m.sim.step();
    }
    const crate = m.sim.state.crates[0];
    if (!crate) throw new Error('no crate');
    const speeds: number[] = [];
    for (let i = 0; i < 2000 && !crate.grounded; i++) {
      m.sim.step();
      speeds.push(crate.velocity.y);
    }
    expect(Math.min(...speeds)).toBeGreaterThanOrEqual(-PARACHUTE_SPEED - 1e-9);
    expect(crate.grounded).toBe(true);
    const landedY = crate.position.y;
    const below = { x: crate.position.x, y: landedY - 2, z: crate.position.z };
    const spec = { radius: 0.5, maxDamage: 0, knockback: 0, falloff: 'flat' as const };
    resolveExplosion(
      ctxOf(m, []),
      below,
      { ...spec, carveRadius: 3 },
      {
        weaponId: 'x',
        ownerSnailId: 'a:0',
      },
    );
    for (let i = 0; i < 20; i++) m.sim.step();
    expect(crate.grounded).toBe(false);
    expect(crate.position.y).toBeLessThan(landedY);
  });
});

describe('crate pickup', () => {
  it('heals by 25 on contact and removes the crate', () => {
    const m = match(31, [HEALTH]);
    const snail = firstSnail(m);
    snail.health = 50;
    putCrate(m, HEALTH.id, snail.position);
    const events = m.sim.step();
    expect(snail.health).toBe(75);
    expect(m.sim.state.crates).toHaveLength(0);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'crateCollected', snailId: snail.id, healed: 25 }),
    );
  });

  it('caps healing at max health', () => {
    const m = match(31, [HEALTH]);
    const snail = firstSnail(m);
    snail.health = 90;
    putCrate(m, HEALTH.id, snail.position);
    const events = m.sim.step();
    expect(snail.health).toBe(snail.maxHealth);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'crateCollected', healed: snail.maxHealth - 90 }),
    );
  });

  it('does not collect from far away', () => {
    const m = match(31, [HEALTH]);
    const snail = firstSnail(m);
    putCrate(m, HEALTH.id, { ...snail.position, x: snail.position.x + 3 });
    m.sim.step();
    expect(m.sim.state.crates).toHaveLength(1);
  });

  it('grants weapon stock to the snail team inventory', () => {
    const m = match(32, [SUPPLY]);
    const snail = firstSnail(m);
    putCrate(m, SUPPLY.id, snail.position);
    putCrate(m, SUPPLY.id, snail.position);
    m.sim.step();
    expect(m.sim.state.teams[0]?.inventory).toEqual({ 'test:pebble-toss': 6 });
    expect(m.sim.state.teams[1]?.inventory).toBeUndefined();
  });

  it('mystery crates roll the crates RNG: deterministic, never lethal, whole table reachable', () => {
    const outcomes = new Set<string>();
    const open = (seed: number): SimEvent | undefined => {
      const m = match(seed, [MYSTERY]);
      const snail = firstSnail(m);
      snail.health = 10;
      putCrate(m, MYSTERY.id, snail.position);
      const e = m.sim.step().find((x) => x.type === 'crateCollected');
      expect(snail.alive).toBe(true);
      return e;
    };
    for (let seed = 1; seed <= 40; seed++) {
      const e = open(seed);
      if (e?.type !== 'crateCollected') throw new Error('not collected');
      if (e.healed > 0) outcomes.add('heal');
      else if (e.damage > 0) outcomes.add('damage');
      else outcomes.add(e.weapons.length > 0 ? 'weapons' : 'status');
      expect(open(seed)).toEqual(e);
    }
    expect([...outcomes].sort()).toEqual(['damage', 'heal', 'status', 'weapons']);
  });
});

describe('crate destruction', () => {
  it('an explosion in range destroys a crate and emits an event', () => {
    const m = match(41, [HEALTH]);
    const events: SimEvent[] = [];
    const near = putCrate(m, HEALTH.id, { x: 30, y: 20, z: 30 });
    putCrate(m, HEALTH.id, { x: 50, y: 20, z: 50 });
    resolveExplosion(
      ctxOf(m, events),
      { x: 31, y: 20, z: 30 },
      { radius: 2, maxDamage: 10, knockback: 0, falloff: 'linear' },
      { weaponId: 'x', ownerSnailId: 'a:0' },
    );
    expect(m.sim.state.crates.map((c) => c.id)).not.toContain(near.id);
    expect(m.sim.state.crates).toHaveLength(1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'crateDestroyed', crateId: near.id, reason: 'explosion' }),
    );
  });

  it('a falling crate settles before the turn can end', () => {
    const m = match(42, [HEALTH]);
    const crate = putCrate(m, HEALTH.id, { x: 30, y: 25, z: 30 });
    crate.grounded = false;
    for (let i = 0; i < 2000 && !crate.grounded; i++) m.sim.step();
    expect(crate.grounded).toBe(true);
  });
});
