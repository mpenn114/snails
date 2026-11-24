import { describe, expect, it } from 'vitest';
import { CrateSchema, StatusSchema, WeaponSchema, WindSchema, AreaSchema } from './schemas.js';
import { MotionSchema } from '../physics/motion.js';

const weapon = {
  id: 'base:thing',
  name: 'Thing',
  category: 'projectile',
  launch: { minSpeed: 1, maxSpeed: 2, gravityScale: 1, windScale: 1, projectileRadius: 0.1 },
  fuseSeconds: 0,
  effects: [{ type: 'damage', radius: 1, maxDamage: 5 }],
  ammo: 3,
};

describe('schemas', () => {
  it('accepts a minimal weapon and optional pattern, motion and perTurn', () => {
    expect(WeaponSchema.safeParse(weapon).success).toBe(true);
    const full = {
      ...weapon,
      pattern: { count: 5, spread: 0.2, spreadByPower: true },
      motion: { kind: 'ballistic' },
      perTurn: 2,
      requiresTech: 't',
    };
    expect(WeaponSchema.safeParse(full).success).toBe(true);
  });

  it('rejects legacy fields, bad ids, unknown effects and inverted speeds', () => {
    expect(WeaponSchema.safeParse({ ...weapon, explosion: {} }).success).toBe(false);
    expect(WeaponSchema.safeParse({ ...weapon, id: 'Bad Id' }).success).toBe(false);
    expect(WeaponSchema.safeParse({ ...weapon, effects: [{ type: 'explode' }] }).success).toBe(
      false,
    );
    expect(WeaponSchema.safeParse({ ...weapon, effects: [] }).success).toBe(false);
    const launch = { ...weapon.launch, minSpeed: 9 };
    expect(WeaponSchema.safeParse({ ...weapon, launch }).success).toBe(false);
    expect(WeaponSchema.safeParse({ ...weapon, motion: { kind: 'teleporting' } }).success).toBe(
      false,
    );
  });

  it('validates crates, winds, statuses and areas', () => {
    const crate = { id: 'a:c', name: 'C', kind: 'health', weight: 2, contents: { heal: 25 } };
    expect(CrateSchema.safeParse(crate).success).toBe(true);
    expect(CrateSchema.safeParse({ ...crate, weight: 0 }).success).toBe(false);
    expect(CrateSchema.safeParse({ ...crate, kind: 'bomb' }).success).toBe(false);
    const wind = { id: 'a:w', name: 'W', minStrength: 1, maxStrength: 3, changesMidFlight: false };
    expect(WindSchema.safeParse(wind).success).toBe(true);
    expect(WindSchema.safeParse({ ...wind, minStrength: 5 }).success).toBe(false);
    expect(StatusSchema.safeParse({ id: 'a:s', name: 'S', perTurnDamage: 3 }).success).toBe(true);
    expect(StatusSchema.safeParse({ id: 'a:s', name: 'S', perTurnDamage: -3 }).success).toBe(false);
    const area = { id: 'a:x', name: 'X', defaultRadius: 2, defaultTurns: 3, windDrift: 1 };
    expect(AreaSchema.safeParse(area).success).toBe(true);
    expect(AreaSchema.safeParse({ ...area, defaultTurns: 0 }).success).toBe(false);
  });

  it('only knows the ballistic motion for now', () => {
    expect(MotionSchema.safeParse({ kind: 'ballistic' }).success).toBe(true);
  });
});
