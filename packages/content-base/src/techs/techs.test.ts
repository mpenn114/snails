import { describe, expect, it } from 'vitest';
import {
  createMatch,
  damageAround,
  loadContentPacks,
  teamStat,
  weaponModifier,
  type MatchSetup,
  type SimContext,
  type TechnologyDefinition,
} from '@snails/core';
import { basePack } from '../index.js';
import { technologies } from './index.js';

const { registries } = loadContentPacks([basePack]);
const byId = (id: string): TechnologyDefinition => {
  const t = technologies.find((x) => x.id === id);
  if (!t) throw new Error(`no tech ${id}`);
  return t;
};

function build(): MatchSetup {
  const m = createMatch({
    seed: 5,
    teams: [
      { id: 'a', name: 'A', colour: '#f00', snailNames: ['A1', 'A2'] },
      { id: 'b', name: 'B', colour: '#00f', snailNames: ['B1', 'B2'] },
    ],
    terrain: { nx: 64, ny: 32, nz: 64, caveDensity: 0, islandFalloff: false, baseHeight: 8 },
    turn: { introDuration: 0.5, retreatDuration: 0.5, maxTurns: 200 },
    weapons: registries.weapons.list(),
    statuses: registries.statuses.list(),
    areas: registries.areas.list(),
    technologies: registries.technologies.list(),
    settings: { research: 'on' },
  });
  for (const t of m.sim.state.teams) t.research!.calcium = 1000;
  m.sim.step();
  return m;
}

const teamA = (m: MatchSetup) => m.sim.state.teams[0]!;

function endTurn(m: MatchSetup): void {
  const start = m.sim.state.turn.turnNumber;
  m.sim.enqueue({ type: 'endTurn', teamId: m.sim.state.turn.activeTeamId as string });
  for (let i = 0; i < 6000 && m.sim.state.turn.turnNumber === start; i++) m.sim.step();
}

/** Marks prerequisites done, queues `id` for team a and plays turns until it completes. */
function complete(m: MatchSetup, id: string): void {
  const t = byId(id);
  const a = teamA(m);
  for (const p of [...t.prerequisites, ...(t.anyOf ? [t.anyOf[0]!] : [])]) {
    if (!a.researched.includes(p)) a.researched.push(p);
  }
  // Tier N needs N-1 completed techs; stand-ins fill the count without effects.
  for (let n = 0; a.researched.length < t.tier - 1; n++) a.researched.push(`filler-${n}`);
  m.sim.submit({ type: 'queueResearch', teamId: 'a', techId: id }, 'a');
  m.sim.step();
  for (let i = 0; i < 12 && !a.researched.includes(id); i++) endTurn(m);
  expect(a.researched).toContain(id);
}

function ctxOf(m: MatchSetup): SimContext {
  return {
    state: m.sim.state,
    terrain: m.sim.terrain,
    rng: m.sim.rng,
    dt: 1 / 60,
    techs: m.content.technologies,
    emit: () => undefined,
  };
}

const stock = (m: MatchSetup, w: string) => teamA(m).inventory?.[w];
const mod = (m: MatchSetup, w: string, s: 'damage' | 'radius', base: number) =>
  weaponModifier(m.sim.state, m.content.technologies, 'a', w, s, base);
const stat = (m: MatchSetup, s: Parameters<typeof teamStat>[3], base: number) =>
  teamStat(m.sim.state, m.content.technologies, 'a', s, base);

describe('base tech data', () => {
  const table: [string, string, number, number, number, string[], string[]][] = [
    ['salt-mining', 'weaponry', 1, 20, 1, [], []],
    ['sticky-slime', 'weaponry', 1, 25, 1, [], []],
    ['heavy-pebbles', 'weaponry', 2, 40, 2, [], ['salt-mining', 'sticky-slime']],
    ['radula-guidance', 'weaponry', 2, 50, 2, ['sticky-slime'], []],
    ['beetle-calls', 'weaponry', 3, 80, 3, ['heavy-pebbles'], []],
    ['calcified-shell', 'shell', 1, 25, 1, [], []],
    ['spiked-whorl', 'shell', 2, 45, 2, ['calcified-shell'], []],
    ['iron-plating', 'shell', 2, 50, 2, ['calcified-shell'], []],
    ['crystal-lattice', 'shell', 3, 85, 3, ['iron-plating'], []],
    ['regrowth', 'shell', 3, 70, 2, ['calcified-shell'], []],
  ];
  it.each(table)('%s matches the design doc', (id, branch, tier, cost, turns, pre, any) => {
    const t = byId(id);
    expect([t.branch, t.tier, t.cost, t.researchTurns]).toEqual([branch, tier, cost, turns]);
    expect(t.prerequisites).toEqual(pre);
    expect(t.anyOf ?? []).toEqual(any);
  });

  it('gates the weapons and the calcified shell upgrade on the new techs', () => {
    const gate = (w: string) => registries.weapons.get(`base:${w}`)?.requiresTech;
    expect(gate('salt-shaker')).toBe('salt-mining');
    expect(gate('slime-grenade')).toBe('sticky-slime');
    expect(gate('radula-missile')).toBe('radula-guidance');
    expect(gate('beetle-barrage')).toBe('beetle-calls');
    expect(registries.shellUpgrades.get('calcified-shell')?.requiresTech).toBe('calcified-shell');
  });
});

describe('Weaponry techs', () => {
  it('Salt Mining unlocks 3 Salt Shakers', () => {
    const m = build();
    complete(m, 'salt-mining');
    expect(stock(m, 'base:salt-shaker')).toBe(3);
  });

  it('Sticky Slime unlocks the Slime Grenade and adds 0.5 m radius', () => {
    const m = build();
    complete(m, 'sticky-slime');
    expect(stock(m, 'base:slime-grenade')).toBe(3);
    expect(mod(m, 'base:slime-grenade', 'radius', 3)).toBe(3.5);
  });

  it('Heavy Pebbles needs Salt Mining or Sticky Slime, then boosts Pebble Toss 25%', () => {
    const m = build();
    m.sim.submit({ type: 'queueResearch', teamId: 'a', techId: 'heavy-pebbles' }, 'a');
    expect(teamA(m).research?.queue).not.toContain('heavy-pebbles');
    expect(teamA(m).research?.active).toBeNull();
    complete(m, 'heavy-pebbles');
    expect(mod(m, 'base:pebble-toss', 'damage', 16)).toBe(20);
    expect(mod(m, 'base:pebble-toss', 'radius', 2)).toBe(2.5);
  });

  it('Radula Guidance unlocks 2 Radula Missiles', () => {
    const m = build();
    complete(m, 'radula-guidance');
    expect(stock(m, 'base:radula-missile')).toBe(2);
  });

  it('Beetle Calls unlocks a Beetle Barrage and grants another every 4 rounds', () => {
    const m = build();
    complete(m, 'beetle-calls');
    const first = stock(m, 'base:beetle-barrage') ?? 0;
    expect(first).toBe(1);
    for (let i = 0; i < 8; i++) endTurn(m);
    expect(stock(m, 'base:beetle-barrage')).toBe(first + 1);
  });
});

describe('Shell and Armour techs', () => {
  it('Calcified Shell raises max health 15, heals 15 and sets the material', () => {
    const m = build();
    const s = teamA(m).snails[0]!;
    s.health = 40;
    const max = s.maxHealth;
    complete(m, 'calcified-shell');
    expect(s.maxHealth).toBe(max + 15);
    expect(s.health).toBe(55);
    expect(byId('calcified-shell').visual?.shellMaterial).toBe('calcified');
  });

  it('Spiked Whorl adds Shell Bash damage and thorns that hurt melee attackers', () => {
    const m = build();
    complete(m, 'spiked-whorl');
    expect(stat(m, 'meleeThorns', 0)).toBe(10);
    expect(mod(m, 'base:shell-bash', 'damage', 20)).toBe(26);
    expect(byId('spiked-whorl').visual?.attachments).toContain('spikes');
    const a1 = teamA(m).snails[0]!;
    const b1 = m.sim.state.teams[1]!.snails[0]!;
    a1.position = { x: 20, y: 12, z: 20 };
    b1.position = { x: 21, y: 12, z: 20 };
    const spec = { radius: 3, maxDamage: 10, knockback: 0, falloff: 'linear' } as const;
    const bash = { weaponId: 'base:shell-bash', ownerSnailId: b1.id, excludeOwner: true };
    damageAround(ctxOf(m), { x: 20.5, y: 12, z: 20 }, spec, bash, false);
    expect(a1.health).toBeLessThan(a1.maxHealth);
    expect(b1.health).toBeLessThan(b1.maxHealth);
  });

  it('Iron Plating takes 20% less blast damage and adds 10 max health', () => {
    const m = build();
    const s = teamA(m).snails[0]!;
    const max = s.maxHealth;
    complete(m, 'iron-plating');
    expect(s.maxHealth).toBe(max + 10); // the prerequisite is marked done, not researched
    expect(stat(m, 'blastDamageTaken', 1)).toBeCloseTo(0.8);
    expect(byId('iron-plating').visual?.shellMaterial).toBe('iron');
  });

  it('Crystal Lattice blocks 80% in retreat and reflects 10% of projectile damage', () => {
    const m = build();
    complete(m, 'crystal-lattice');
    expect(stat(m, 'retreatDamageTaken', 1)).toBeCloseTo(0.2);
    expect(stat(m, 'projectileReflect', 0)).toBeCloseTo(0.1);
    expect(byId('crystal-lattice').visual?.shellMaterial).toBe('crystal');
    const v = teamA(m).snails[0]!;
    const f = m.sim.state.teams[1]!.snails[0]!;
    v.position = { x: 20, y: 12, z: 20 };
    f.position = { x: 21, y: 12, z: 20 };
    v.maxHealth = f.maxHealth = 400;
    const spec = { radius: 6, maxDamage: 100, knockback: 0, falloff: 'linear' } as const;
    const fire = () => {
      v.health = f.health = 400;
      const src = { weaponId: 'w', ownerSnailId: f.id };
      damageAround(ctxOf(m), { x: 20.5, y: 12, z: 20 }, spec, src, false);
    };
    m.sim.state.turn.phase = 'action';
    fire();
    const hit = 400 - v.health;
    expect(hit).toBeGreaterThan(30);
    expect(400 - f.health).toBeGreaterThanOrEqual(Math.round(hit * 0.1));
    m.sim.state.turn.phase = 'retreat';
    m.sim.state.turn.activeTeamId = 'a';
    fire();
    expect(400 - v.health).toBe(Math.round(hit * 0.2));
  });

  it('Regrowth heals 5 HP per turn for a snail that stayed put', () => {
    const m = build();
    complete(m, 'regrowth');
    const [s1, s2] = teamA(m).snails;
    s1!.health = 50;
    s2!.health = 50;
    s2!.position = { ...s2!.position, x: s2!.position.x + 3 };
    endTurn(m);
    endTurn(m);
    expect(s1!.health).toBe(55);
    expect(s2!.health).toBe(50);
  });
});
