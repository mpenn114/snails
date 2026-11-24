import { afterEach, describe, expect, it } from 'vitest';
import { runEffects } from '../content/effects/handlers.js';
import type { TechnologyDefinition, WeaponDefinition } from '../content/types.js';
import { damageAround } from '../physics/explosion.js';
import { createMatch, type MatchSetup } from '../sim/match.js';
import type { SimEvent } from '../sim/events.js';
import { PEBBLE, testMatchOptions } from '../sim/test-match.js';
import type { SimContext } from '../sim/types.js';
import { endTurn, tech } from './research-test-helper.js';
import type { TechEffect } from './research-types.js';
import {
  registerTechHook,
  teamHasAbility,
  teamHasFlag,
  teamStat,
  unregisterTechHook,
  weaponModifier,
} from './tech-effects.js';

const GID = 'test:gun';
const GUN: WeaponDefinition = { ...PEBBLE, id: 'test:gun', ammo: 3, requiresTech: 'unlock' };
const fx = (...effects: TechEffect[]): Partial<TechnologyDefinition> => ({ effects });
const mod = (
  stat: Extract<TechEffect, { type: 'modifyStat' }>['stat'],
  op: 'add' | 'mul',
  value: number,
): TechEffect => ({ type: 'modifyStat', stat, op, value });

function build(techs: TechnologyDefinition[]): MatchSetup {
  const m = createMatch({
    ...testMatchOptions(5),
    weapons: [PEBBLE, GUN],
    technologies: techs,
    settings: { research: 'on' },
  });
  for (const t of m.sim.state.teams) {
    t.research ??= {
      calcium: 500,
      queue: [],
      active: null,
      damageCalciumThisTurn: 0,
      roundsSinceDamage: 0,
    };
  }
  m.sim.step();
  for (const t of m.sim.state.teams) t.research!.calcium = 500;
  return m;
}
const teamA = (m: MatchSetup) => m.sim.state.teams[0]!;
const teamB = (m: MatchSetup) => m.sim.state.teams[1]!;
const techs = (m: MatchSetup) => m.content.technologies;

/** Researches `id` for team a: queue, then play through to its completion. */
function complete(m: MatchSetup, id: string): SimEvent[] {
  m.sim.submit({ type: 'queueResearch', teamId: 'a', techId: id }, 'a');
  m.sim.step();
  return [...endTurn(m), ...endTurn(m)];
}
function ctxOf(m: MatchSetup, events: SimEvent[] = []): SimContext {
  return {
    state: m.sim.state,
    terrain: m.sim.terrain,
    rng: m.sim.rng,
    dt: 1 / 60,
    techs: techs(m),
    emit: (e) => events.push(e),
  };
}

describe('stat queries', () => {
  it('applies adds before muls, only for completed techs', () => {
    const m = build([
      tech('x', fx(mod('crawlSpeed', 'mul', 2))),
      tech('y', fx(mod('crawlSpeed', 'add', 1))),
      tech('z', fx(mod('crawlSpeed', 'add', 100))),
    ]);
    const get = () => teamStat(m.sim.state, techs(m), 'a', 'crawlSpeed', 3);
    expect(get()).toBe(3);
    teamA(m).researched.push('x', 'y'); // mul researched first; adds still apply first
    expect(get()).toBe(8);
    expect(teamStat(m.sim.state, techs(m), 'b', 'crawlSpeed', 3)).toBe(3);
    expect(teamStat(m.sim.state, undefined, 'a', 'crawlSpeed', 3)).toBe(3);
  });

  it('answers weapon modifiers, flags and abilities', () => {
    const m = build([
      tech(
        'w',
        fx(
          { type: 'modifyWeapon', weaponId: 'test:gun', stat: 'damage', op: 'add', value: 5 },
          { type: 'modifyWeapon', weaponId: 'test:gun', stat: 'damage', op: 'mul', value: 2 },
          { type: 'setFlag', flag: 'shiny' },
          { type: 'addAbility', abilityId: 'burrow' },
        ),
      ),
    ]);
    const q = () => weaponModifier(m.sim.state, techs(m), 'a', 'test:gun', 'damage', 10);
    expect(q()).toBe(10);
    expect(teamHasFlag(m.sim.state, techs(m), 'a', 'shiny')).toBe(false);
    teamA(m).researched.push('w');
    expect(q()).toBe(30);
    expect(weaponModifier(m.sim.state, techs(m), 'a', 'other', 'damage', 10)).toBe(10);
    expect(weaponModifier(m.sim.state, techs(m), 'a', 'test:gun', 'radius', 10)).toBe(10);
    expect(teamHasFlag(m.sim.state, techs(m), 'a', 'shiny')).toBe(true);
    expect(teamHasAbility(m.sim.state, techs(m), 'a', 'burrow')).toBe(true);
    expect(teamHasAbility(m.sim.state, techs(m), 'b', 'burrow')).toBe(false);
  });
});

describe('hooks', () => {
  afterEach(() => unregisterTechHook('test-hook'));
  it('feeds events to the owning team after completion only', () => {
    const seen: string[] = [];
    registerTechHook('test-hook', (_c, e, teamId) => {
      if (e.type === 'turnStarted') seen.push(teamId);
    });
    const m = build([tech('h', fx({ type: 'hook', hookId: 'test-hook' }))]);
    endTurn(m);
    expect(seen).toEqual([]);
    teamA(m).researched.push('h');
    endTurn(m);
    endTurn(m);
    expect(seen).toEqual(['a', 'a']);
  });
});

describe('completion effects', () => {
  it('heals living snails up to max and raises max health with current', () => {
    const m = build([
      tech('h', fx({ type: 'heal', amount: 30 })),
      tech('hp', { cost: 1, ...fx(mod('maxHealth', 'add', 20)) }),
    ]);
    const [s1, s2] = teamA(m).snails;
    s1!.health = 50;
    s2!.health = s2!.maxHealth - 5;
    complete(m, 'h');
    expect(s1!.health).toBe(80);
    expect(s2!.health).toBe(s2!.maxHealth);
    const before = s1!.maxHealth;
    complete(m, 'hp');
    expect(s1!.maxHealth).toBe(before + 20);
    expect(s1!.health).toBe(100);
    expect(teamB(m).snails[0]!.maxHealth).toBe(before);
  });

  it('unlockWeapon stocks the weapon ammo (or an override)', () => {
    const m = build([tech('unlock', fx({ type: 'unlockWeapon', weaponId: 'test:gun' }))]);
    teamA(m).inventory![GID] = 0;
    complete(m, 'unlock');
    expect(teamA(m).inventory?.[GID]).toBe(3);
    const m2 = build([
      tech('unlock', fx({ type: 'unlockWeapon', weaponId: 'test:gun', stock: 5 })),
    ]);
    teamA(m2).inventory![GID] = 0;
    complete(m2, 'unlock');
    expect(teamA(m2).inventory?.[GID]).toBe(5);
  });

  it('grantStock grants now and every N rounds, with stockBonus', () => {
    const m = build([
      tech('g', fx({ type: 'grantStock', weaponId: 'test:gun', amount: 2, everyRounds: 2 })),
      tech('bonus', fx(mod('stockBonus', 'add', 1))),
    ]);
    teamA(m).inventory![GID] = 0;
    complete(m, 'g');
    expect(teamA(m).inventory?.[GID]).toBe(2);
    endTurn(m);
    endTurn(m); // a's first turn after completion
    expect(teamA(m).inventory?.[GID]).toBe(2);
    endTurn(m);
    endTurn(m); // a's second turn: due
    expect(teamA(m).inventory?.[GID]).toBe(4);
    teamA(m).researched.push('bonus');
    teamA(m).inventory![GID] = 0;
    endTurn(m);
    endTurn(m);
    endTurn(m);
    endTurn(m);
    expect(teamA(m).inventory?.[GID]).toBe(3); // 2 + bonus 1
  });

  it('calciumPerTurn changes turn income', () => {
    const m = build([tech('c', fx(mod('calciumPerTurn', 'add', 5)))]);
    teamA(m).researched.push('c');
    teamA(m).research!.calcium = 0;
    endTurn(m);
    endTurn(m);
    expect(teamA(m).research!.calcium).toBe(15);
  });
});

const SPEC = { radius: 6, maxDamage: 40, knockback: 0, falloff: 'linear' } as const;
const AT = { x: 20.5, y: 12, z: 20 };

function place(m: MatchSetup): void {
  teamA(m).snails[0]!.position = { x: 20, y: 12, z: 20 };
  teamB(m).snails[0]!.position = { x: 21, y: 12, z: 20 };
}

/** Damage dealt to B1 by an explosion of A1 (optionally a melee strike). */
function dmg(m: MatchSetup, melee = false): number {
  place(m);
  const a = teamA(m).snails[0]!;
  const b = teamB(m).snails[0]!;
  a.health = a.maxHealth;
  b.health = b.maxHealth;
  const src = {
    weaponId: 'test:gun',
    ownerSnailId: a.id,
    ...(melee ? { excludeOwner: true } : {}),
  };
  damageAround(ctxOf(m), AT, SPEC, src, false);
  return b.maxHealth - b.health;
}

describe('damage pipeline', () => {
  const half = (id: string, s: 'blastDamageTaken' | 'damageDealt' | 'meleeDamage') =>
    tech(id, fx(mod(s, 'mul', 0.5)));

  it('scales by blastDamageTaken, damageDealt and meleeDamage', () => {
    const base = dmg(build([]));
    expect(base).toBeGreaterThan(0);
    const m1 = build([half('x', 'blastDamageTaken')]);
    teamB(m1).researched.push('x');
    expect(dmg(m1)).toBe(Math.round(base * 0.5));
    const m2 = build([half('x', 'damageDealt')]);
    teamA(m2).researched.push('x');
    expect(dmg(m2)).toBe(Math.round(base * 0.5));
    const m3 = build([half('x', 'meleeDamage')]);
    teamA(m3).researched.push('x');
    expect(dmg(m3)).toBe(base);
    expect(dmg(m3, true)).toBe(Math.round(base * 0.5));
  });

  it('meleeThorns hurts only a melee attacker', () => {
    const m = build([tech('th', fx(mod('meleeThorns', 'add', 7)))]);
    teamB(m).researched.push('th');
    const a = teamA(m).snails[0]!;
    const events: SimEvent[] = [];
    place(m);
    damageAround(
      ctxOf(m, events),
      AT,
      SPEC,
      { weaponId: 'test:gun', ownerSnailId: a.id, excludeOwner: true },
      false,
    );
    expect(a.maxHealth - a.health).toBe(7);
    expect(events.some((e) => e.type === 'snailDamaged' && e.snailId === a.id)).toBe(true);
    a.health = a.maxHealth;
    dmg(m, false);
    expect(a.maxHealth - a.health).toBeGreaterThan(0); // blast hits the owner, but no thorns
  });

  it('modifyWeapon scales the weapon damage effect', () => {
    const m = build([
      tech(
        'w',
        fx({ type: 'modifyWeapon', weaponId: PEBBLE.id, stat: 'damage', op: 'mul', value: 2 }),
      ),
    ]);
    const dealt = (): number => {
      place(m);
      const b = teamB(m).snails[0]!;
      b.health = b.maxHealth;
      const ctx = { ...ctxOf(m), content: m.content };
      const eff = PEBBLE.effects.filter((e) => e.type === 'damage');
      runEffects(ctx, eff, AT, { weaponId: PEBBLE.id, ownerSnailId: teamA(m).snails[0]!.id });
      return b.maxHealth - b.health;
    };
    const base = dealt();
    teamA(m).researched.push('w');
    expect(dealt()).toBe(Math.min(base * 2, 100));
  });
});

describe('movement and hazards', () => {
  it('fallDamageTaken scales landing damage', () => {
    const fall = (m: MatchSetup): number => {
      const s = teamA(m).snails[0]!;
      s.health = s.maxHealth;
      s.pendingLanding = { impactSpeed: 10, fallDistance: 8 };
      m.sim.step();
      return s.maxHealth - s.health;
    };
    const base = fall(build([]));
    expect(base).toBeGreaterThan(0);
    const m = build([tech('f', fx(mod('fallDamageTaken', 'mul', 0)))]);
    teamA(m).researched.push('f');
    expect(fall(m)).toBe(0);
  });

  it('crawlSpeed and jumpDistance change how far a snail moves', () => {
    const crawl = (m: MatchSetup): number => {
      const s = teamA(m).snails[0]!;
      const x0 = s.position.x;
      const z0 = s.position.z;
      s.moveIntent = { direction: 1, jumpRequested: false };
      for (let i = 0; i < 30; i++) m.sim.step();
      return Math.hypot(s.position.x - x0, s.position.z - z0);
    };
    const base = crawl(build([]));
    expect(base).toBeGreaterThan(0.1);
    const m = build([tech('c', fx(mod('crawlSpeed', 'mul', 2)))]);
    teamA(m).researched.push('c');
    expect(crawl(m)).toBeGreaterThan(base * 1.6);
  });

  it('maxClimbDegrees is read from the team stat', () => {
    const m = build([tech('k', fx(mod('maxClimbDegrees', 'add', 15)))]);
    teamA(m).researched.push('k');
    expect(teamStat(m.sim.state, techs(m), 'a', 'maxClimbDegrees', 50)).toBe(65);
  });
});
