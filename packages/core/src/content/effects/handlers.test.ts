import { describe, expect, it } from 'vitest';
import { makeTestCtx } from '../../sim/test-ctx.js';
import type { AreaDefinition, StatusDefinition, WeaponDefinition } from '../types.js';
import { effectHandlers, runEffects } from './handlers.js';

const SALT: StatusDefinition = { id: 't:salt', name: 'Salt', perTurnDamage: 4, defaultTurns: 2 };
const CLOUD: AreaDefinition = { id: 't:cloud', name: 'Cloud', defaultRadius: 3, defaultTurns: 3 };
const SUB: WeaponDefinition = {
  id: 't:sub',
  name: 'Sub',
  category: 'projectile',
  launch: { minSpeed: 1, maxSpeed: 2, gravityScale: 1, windScale: 1, projectileRadius: 0.1 },
  fuseSeconds: 2,
  effects: [{ type: 'damage', radius: 1, maxDamage: 1 }],
  ammo: 'infinite',
};
const src = { weaponId: 't:w', ownerSnailId: 'a1' };

function setup() {
  return makeTestCtx({ weapons: [SUB], statuses: [SALT], areas: [CLOUD] });
}

describe('effect handler table', () => {
  it('has exactly one handler per effect type', () => {
    expect(Object.keys(effectHandlers).sort()).toEqual([
      'carve',
      'damage',
      'move',
      'spawn',
      'status',
    ]);
  });

  it('damage hurts and knocks back snails in range only, falling off with distance', () => {
    const { ctx, events } = setup();
    const b = ctx.state.teams[1]?.snails[0];
    const at = { x: 19, y: 6, z: 20 };
    runEffects(ctx, [{ type: 'damage', radius: 3, maxDamage: 40, knockback: 5 }], at, src);
    expect(b?.health).toBeLessThan(100);
    expect(b?.velocity.y).toBeGreaterThan(0);
    expect(ctx.state.teams[0]?.snails[0]?.health).toBe(100);
    expect(events.map((e) => e.type)).toEqual(['explosion', 'snailDamaged']);
  });

  it('carve removes terrain and emits terrainCarved', () => {
    const { ctx, events } = setup();
    const before = ctx.terrain.data.slice();
    runEffects(ctx, [{ type: 'carve', radius: 2 }], { x: 15, y: 5, z: 20 }, src);
    expect(ctx.terrain.data).not.toEqual(before);
    expect(events.some((e) => e.type === 'terrainCarved')).toBe(true);
  });

  it('status applies to snails in radius and uses the definition default turns', () => {
    const { ctx, events } = setup();
    runEffects(
      ctx,
      [{ type: 'status', statusId: 't:salt', radius: 1 }],
      { x: 20, y: 6, z: 20 },
      src,
    );
    expect(ctx.state.teams[1]?.snails[0]?.statuses).toEqual([
      { id: 't:salt', turnsLeft: 2, magnitude: 1, sourceSnailId: 'a1' },
    ]);
    expect(ctx.state.teams[0]?.snails[0]?.statuses).toBeUndefined();
    expect(events).toHaveLength(1);
  });

  it('spawn creates an area at the point with default or overridden size', () => {
    const { ctx } = setup();
    const at = { x: 5, y: 6, z: 5 };
    runEffects(ctx, [{ type: 'spawn', spawn: { what: 'area', areaId: 't:cloud' } }], at, src);
    runEffects(
      ctx,
      [{ type: 'spawn', spawn: { what: 'area', areaId: 't:cloud', radius: 1, turns: 9 } }],
      at,
      src,
    );
    expect(ctx.state.areas.map((a) => [a.id, a.radius, a.turnsLeft])).toEqual([
      ['a1', 3, 3],
      ['a2', 1, 9],
    ]);
  });

  it('spawn creates sub-projectiles carrying the sub-weapon parameters', () => {
    const { ctx } = setup();
    const spawn = { what: 'projectiles', weaponId: 't:sub', count: 4, speed: 5 } as const;
    runEffects(ctx, [{ type: 'spawn', spawn }], { x: 5, y: 6, z: 5 }, src);
    const ps = ctx.state.projectiles;
    expect(ps).toHaveLength(4);
    expect(ps.every((p) => p.weaponId === 't:sub' && p.maxAge === 2 && p.velocity.y > 0)).toBe(
      true,
    );
    expect(new Set(ps.map((p) => p.velocity.x.toFixed(3))).size).toBeGreaterThan(1);
  });

  it('move teleports the firer to the point and emits snailMoved', () => {
    const { ctx, events } = setup();
    runEffects(ctx, [{ type: 'move', mode: 'teleport', lift: 1 }], { x: 3, y: 6, z: 4 }, src);
    const a = ctx.state.teams[0]?.snails[0];
    expect(a?.position).toEqual({ x: 3, y: 7, z: 4 });
    expect(a?.grounded).toBe(false);
    expect(events[0]).toMatchObject({ type: 'snailMoved', snailId: 'a1' });
  });

  it('ignores effects that reference missing content or a dead firer', () => {
    const { ctx, events } = setup();
    const at = { x: 3, y: 6, z: 4 };
    runEffects(
      ctx,
      [
        { type: 'status', statusId: 'x:none', radius: 5 },
        { type: 'spawn', spawn: { what: 'area', areaId: 'x:none' } },
        { type: 'spawn', spawn: { what: 'projectiles', weaponId: 'x:none', count: 2, speed: 1 } },
      ],
      at,
      src,
    );
    const a = ctx.state.teams[0]?.snails[0];
    if (a) a.alive = false;
    runEffects(ctx, [{ type: 'move', mode: 'teleport' }], at, src);
    expect(events).toHaveLength(0);
    expect(ctx.state.areas).toHaveLength(0);
  });
});
