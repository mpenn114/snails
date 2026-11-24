import { describe, expect, it } from 'vitest';
import {
  canResearch,
  createMatch,
  damageAround,
  type DamageSpec,
  loadContentPacks,
  teamHasAbility,
  teamHasFlag,
  teamStat,
  type MatchSetup,
  type SimContext,
  type SimEvent,
} from '@snails/core';
import { basePack } from '../index.js';
import { mobilityUtilityTechnologies } from './mobility-utility.js';

const { registries } = loadContentPacks([basePack]);

function build(): MatchSetup {
  const m = createMatch({
    seed: 5,
    teams: [
      { id: 'a', name: 'A', colour: '#f00', snailNames: ['A1', 'A2'] },
      { id: 'b', name: 'B', colour: '#00f', snailNames: ['B1', 'B2'] },
    ],
    terrain: { nx: 64, ny: 32, nz: 64, caveDensity: 0, islandFalloff: false, baseHeight: 8 },
    turn: { introDuration: 0.5, retreatDuration: 0.5, maxTurns: 60 },
    weapons: registries.weapons.list(),
    technologies: registries.technologies.list(),
    settings: { research: 'on' },
  });
  for (const t of m.sim.state.teams) {
    t.research ??= {
      calcium: 1000,
      queue: [],
      active: null,
      damageCalciumThisTurn: 0,
      roundsSinceDamage: 0,
    };
  }
  for (const t of m.sim.state.teams) t.research!.calcium = 1000;
  m.sim.step();
  return m;
}

const stat = (m: MatchSetup, s: Parameters<typeof teamStat>[3], base: number, team = 'a') =>
  teamStat(m.sim.state, m.content.technologies, team, s, base);
const flag = (m: MatchSetup, f: string) => teamHasFlag(m.sim.state, m.content.technologies, 'a', f);
const give = (m: MatchSetup, ...ids: string[]) => m.sim.state.teams[0]!.researched.push(...ids);

function endTurn(m: MatchSetup): SimEvent[] {
  const events: SimEvent[] = [];
  const start = m.sim.state.turn.turnNumber;
  m.sim.enqueue({ type: 'endTurn', teamId: m.sim.state.turn.activeTeamId as string });
  for (let i = 0; i < 6000 && m.sim.state.turn.turnNumber === start; i++) {
    events.push(...m.sim.step());
  }
  return events;
}

describe('pack data', () => {
  it('has the 10 techs and 4 capstones with valid links', () => {
    expect(mobilityUtilityTechnologies).toHaveLength(14);
    expect(mobilityUtilityTechnologies.filter((t) => t.capstone).map((t) => t.cost)).toEqual([
      150, 150, 150, 150,
    ]);
    expect(registries.weapons.get('base:slime-rope')?.requiresTech).toBe('slime-rope');
    expect(registries.weapons.get('base:snail-mail')?.requiresTech).toBe('snail-mail');
    expect(registries.technologies.has('snail-mail-network')).toBe(false);
  });
});

describe('mobility stats', () => {
  it('Lubricated Foot, Sticky Climb and Hop Training change the stats', () => {
    const m = build();
    give(m, 'lubricated-foot', 'sticky-climb', 'hop-training');
    expect(stat(m, 'moveBudgetSeconds', 5)).toBe(8);
    expect(stat(m, 'crawlSpeed', 2)).toBeCloseTo(2.3);
    expect(stat(m, 'maxClimbDegrees', 50)).toBe(80);
    expect(stat(m, 'jumpCharges', 1)).toBe(2);
    expect(stat(m, 'jumpDistance', 1)).toBeCloseTo(1.3);
    expect(stat(m, 'crawlSpeed', 2, 'b')).toBe(2);
  });

  it('Hop Training allows exactly one extra jump in the air', () => {
    const airJump = (withTech: boolean, jumpsUsed: number): number => {
      const m = build();
      if (withTech) give(m, 'hop-training');
      const s = m.sim.state.teams[0]!.snails[0]!;
      s.position = { ...s.position, y: s.position.y + 10 };
      s.grounded = false;
      s.jumpsUsed = jumpsUsed;
      s.velocity = { x: 0, y: -1, z: 0 };
      m.sim.enqueue({ type: 'move', snailId: s.id, direction: 0, jump: true });
      m.sim.step();
      return s.velocity.y;
    };
    expect(airJump(false, 1)).toBeLessThan(0);
    expect(airJump(true, 1)).toBeGreaterThan(0);
    expect(airJump(true, 2)).toBeLessThan(0);
  });

  it('Slime Rope and Snail Mail unlock their tools', () => {
    const m = build();
    const team = m.sim.state.teams[0]!;
    expect(team.researched.includes('slime-rope')).toBe(false);
    give(m, 'slime-rope');
    expect(team.researched).toContain('slime-rope');
  });
});

describe('utility and intel', () => {
  it('Egg Hunt adds 5 Calcium per turn and the info techs set flags', () => {
    const m = build();
    expect(stat(m, 'calciumPerTurn', 10)).toBe(10);
    give(m, 'egg-hunt', 'weather-vane', 'eye-stalk-optics', 'scouting-mist');
    expect(stat(m, 'calciumPerTurn', 10)).toBe(15);
    for (const f of ['seeCrates', 'seeNextWind', 'fullAimPreview', 'seeOpponentResearch']) {
      expect(flag(m, f)).toBe(true);
    }
    expect(flag(m, 'seeAll')).toBe(false);
  });

  it('Weather Vane can read a pre-rolled wind that becomes the next real wind', () => {
    const m = build();
    const next = m.sim.state.nextWind;
    expect(next).toBeDefined();
    endTurn(m);
    expect(m.sim.state.wind).toEqual(next);
    expect(m.sim.state.nextWind).not.toEqual(next);
  });
});

describe('capstones', () => {
  it('are one per team and need a tier-3 tech of their branch', () => {
    const m = build();
    const team = m.sim.state.teams[0]!;
    const techs = m.content.technologies;
    const check = (id: string) => canResearch(m.sim.state, team, techs.get(id), techs);
    team.researched.push('lubricated-foot', 'hop-training', 'slime-rope');
    expect(check('great-spiral-glide')).toMatchObject({ ok: false, reason: 'PREREQ_MISSING' });
    team.researched.push('burrow');
    expect(check('great-spiral-glide')).toEqual({ ok: true });
    team.researched.push('great-spiral-glide');
    team.researched.push('weather-vane', 'egg-hunt', 'snail-mail');
    expect(check('great-spiral-oracle')).toMatchObject({ ok: false, reason: 'CAPSTONE_LIMIT' });
  });

  it('Glide: no fall damage and a bigger move budget', () => {
    const m = build();
    give(m, 'great-spiral-glide');
    expect(stat(m, 'fallDamageTaken', 1)).toBe(0);
    expect(stat(m, 'moveBudgetSeconds', 5)).toBe(15);
  });

  it('Oracle: all flags and the steal ability', () => {
    const m = build();
    give(m, 'great-spiral-oracle');
    expect(flag(m, 'seeAll')).toBe(true);
    expect(flag(m, 'seeNextWind')).toBe(true);
    expect(teamHasAbility(m.sim.state, m.content.technologies, 'a', 'steal-tech')).toBe(true);
  });

  it('Arsenal: +20% damage, stockBonus and +1 on every current stock at completion', () => {
    const m = build();
    const team = m.sim.state.teams[0]!;
    team.inventory = { 'base:salt-shaker': 2, 'base:empty': 0 };
    team.researched.push('beetle-calls', 'lubricated-foot', 'weather-vane');
    const r = m.sim.submit(
      { type: 'queueResearch', teamId: 'a', techId: 'great-spiral-arsenal' },
      'a',
    );
    expect(r.ok).toBe(true);
    m.sim.step();
    for (let i = 0; i < 10 && !team.researched.includes('great-spiral-arsenal'); i++) endTurn(m);
    expect(team.researched).toContain('great-spiral-arsenal');
    expect(stat(m, 'damageDealt', 1)).toBeCloseTo(1.2);
    expect(stat(m, 'stockBonus', 0)).toBe(1);
    expect(team.inventory?.['base:salt-shaker']).toBe(3);
    expect(team.inventory?.['base:empty']).toBe(0);
  });

  it('Citadel: a full-health snail ignores the first hit each turn only', () => {
    const m = build();
    give(m, 'great-spiral-citadel');
    const victim = m.sim.state.teams[0]!.snails[0]!;
    const events: SimEvent[] = [];
    const ctx: SimContext = {
      state: m.sim.state,
      terrain: m.sim.terrain,
      rng: m.sim.rng,
      dt: 1 / 60,
      techs: m.content.technologies,
      emit: (e) => events.push(e),
    };
    const spec = { radius: 3, maxDamage: 20, falloff: 'flat', knockback: 0 } satisfies DamageSpec;
    const enemy = m.sim.state.teams[1]!.snails[0]!;
    const hit = () =>
      damageAround(ctx, victim.position, spec, { ownerSnailId: enemy.id, weaponId: 'x' });
    hit();
    expect(victim.health).toBe(victim.maxHealth);
    hit();
    expect(victim.health).toBeLessThan(victim.maxHealth);
    victim.health = victim.maxHealth;
    m.sim.state.turn.turnNumber += 1;
    hit();
    expect(victim.health).toBe(victim.maxHealth);
  });
});
