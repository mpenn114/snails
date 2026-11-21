import { describe, expect, it } from 'vitest';
import type { WeaponDefinition } from '../content/types.js';
import { createMatch } from './match.js';
import { createScriptedBot } from './scripted-bot.js';
import type { SimEvent } from './events.js';

const PEBBLE: WeaponDefinition = {
  id: 'test:pebble-toss',
  name: 'Pebble Toss',
  kind: 'projectile',
  launch: { minSpeed: 5, maxSpeed: 22, gravityScale: 1, windScale: 1, projectileRadius: 0.1 },
  fuseSeconds: 0,
  explosion: { radius: 4, maxDamage: 45, knockback: 6, falloff: 'linear' },
  ammo: 'infinite',
};

const TICK_CAP = 60 * 60 * 40;

function hash(events: SimEvent[]): string {
  const s = JSON.stringify(events);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
}

function playMatch(seed: number) {
  const { sim } = createMatch({
    seed,
    teams: [
      { id: 'a', name: 'A', colour: '#f00', snailNames: ['A1', 'A2'] },
      { id: 'b', name: 'B', colour: '#00f', snailNames: ['B1', 'B2'] },
    ],
    terrain: { nx: 64, ny: 32, nz: 64, caveDensity: 0, islandFalloff: false, baseHeight: 8 },
    turn: { introDuration: 0.5, retreatDuration: 0.5, maxTurns: 60 },
    weapons: [PEBBLE],
  });
  const bots = ['a', 'b'].map((id) => createScriptedBot(id, PEBBLE));
  const events: SimEvent[] = [];
  let lastTick = -1;
  let lastTurn = 0;
  while (sim.state.match.status === 'playing' && sim.state.tick < TICK_CAP) {
    for (const bot of bots) bot(sim);
    events.push(...sim.step());
    expect(sim.state.tick).toBeGreaterThan(lastTick);
    lastTick = sim.state.tick;
    if (sim.state.turn.turnNumber !== lastTurn) {
      lastTurn = sim.state.turn.turnNumber;
      for (const s of sim.state.teams.flatMap((t) => t.snails)) {
        expect(s.health).toBeGreaterThanOrEqual(0);
        expect(s.health).toBeLessThanOrEqual(s.maxHealth);
        if (!s.alive) expect(s.health).toBe(0);
      }
    }
  }
  return { sim, events };
}

describe('full headless match', () => {
  it('plays to a result with a scripted bot, without rejected commands', () => {
    const { sim, events } = playMatch(7);
    expect(sim.state.match.status).not.toBe('playing');
    expect(sim.state.tick).toBeLessThan(TICK_CAP);
    expect(sim.state.turn.turnNumber).toBeLessThan(60); // ended by kills, not the turn limit
    expect(events.filter((e) => e.type === 'commandRejected')).toEqual([]);
    const types = new Set(events.map((e) => e.type));
    for (const t of [
      'turnStarted',
      'projectileFired',
      'explosion',
      'snailDamaged',
      'matchEnded',
    ] as const) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = playMatch(7);
    const b = playMatch(7);
    expect(a.sim.snapshot()).toEqual(b.sim.snapshot());
    expect(hash(a.events)).toBe(hash(b.events));
  });
});
