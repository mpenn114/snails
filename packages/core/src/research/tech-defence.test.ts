import { describe, expect, it } from 'vitest';
import type { TechnologyDefinition } from '../content/types.js';
import { damageAround } from '../physics/explosion.js';
import type { SimEvent } from '../sim/events.js';
import type { MatchSetup } from '../sim/match.js';
import type { SimContext } from '../sim/types.js';
import { endTurn, researchMatch, tech } from './research-test-helper.js';
import type { TechEffect } from './research-types.js';

const fx = (...effects: TechEffect[]): Partial<TechnologyDefinition> => ({ effects });
const stat = (
  s: Extract<TechEffect, { type: 'modifyStat' }>['stat'],
  op: 'add' | 'mul',
  value: number,
): TechEffect => ({ type: 'modifyStat', stat: s, op, value });

const SPEC = { radius: 6, maxDamage: 40, knockback: 0, falloff: 'linear' } as const;
const AT = { x: 20.5, y: 12, z: 20 };

function ctxOf(m: MatchSetup, events: SimEvent[] = []): SimContext {
  return {
    state: m.sim.state,
    terrain: m.sim.terrain,
    rng: m.sim.rng,
    dt: 1 / 60,
    techs: m.content.technologies,
    emit: (e) => events.push(e),
  };
}

/** A1 hits B1 with a projectile; returns [damage to B1, damage to A1]. */
function shoot(m: MatchSetup, phase: 'action' | 'retreat'): [number, number] {
  const a = m.sim.state.teams[0]!.snails[0]!;
  const b = m.sim.state.teams[1]!.snails[0]!;
  a.position = { x: 20, y: 12, z: 20 };
  b.position = { x: 21, y: 12, z: 20 };
  a.health = a.maxHealth;
  b.health = b.maxHealth;
  m.sim.state.turn.phase = phase;
  m.sim.state.turn.activeTeamId = 'b';
  damageAround(ctxOf(m), AT, SPEC, { weaponId: 'w', ownerSnailId: a.id }, false);
  return [b.maxHealth - b.health, a.maxHealth - a.health];
}

describe('retreatDamageTaken', () => {
  it('scales damage to the active team only during the retreat phase', () => {
    const m = researchMatch([tech('r', fx(stat('retreatDamageTaken', 'mul', 0.2)))]);
    m.sim.state.teams[1]!.researched.push('r');
    const open = shoot(m, 'action')[0];
    const retreat = shoot(m, 'retreat')[0];
    expect(open).toBeGreaterThan(5);
    expect(retreat).toBe(Math.round(open * 0.2));
  });
});

describe('projectileReflect', () => {
  it('returns a fraction of projectile damage to the firer, not of melee strikes', () => {
    const m = researchMatch([tech('p', fx(stat('projectileReflect', 'add', 0.25)))]);
    const own = shoot(m, 'action')[1];
    expect(own).toBeGreaterThan(0); // the firer stands inside its own blast
    m.sim.state.teams[1]!.researched.push('p');
    const [dealt, back] = shoot(m, 'action');
    expect(back).toBe(own + Math.round(dealt * 0.25));
    const a = m.sim.state.teams[0]!.snails[0]!;
    const b = m.sim.state.teams[1]!.snails[0]!;
    a.health = a.maxHealth;
    b.health = b.maxHealth;
    const melee = { weaponId: 'w', ownerSnailId: a.id, excludeOwner: true };
    damageAround(ctxOf(m), AT, SPEC, melee, false);
    expect(a.health).toBe(a.maxHealth);
  });
});

describe('healPerStillTurn', () => {
  it('heals a snail that did not move since its previous turn start, not one that moved', () => {
    const m = researchMatch([tech('g', fx(stat('healPerStillTurn', 'add', 5)))]);
    m.sim.step();
    m.sim.state.teams[0]!.researched.push('g');
    const [s1, s2] = m.sim.state.teams[0]!.snails;
    endTurn(m);
    s1!.health = 50;
    s2!.health = 50;
    s2!.position = { ...s2!.position, x: s2!.position.x + 3 };
    endTurn(m);
    expect(s1!.health).toBe(55);
    expect(s2!.health).toBe(50);
    expect(s2!.stillRef).toEqual(s2!.position);
  });
});
