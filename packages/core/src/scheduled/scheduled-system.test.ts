import { describe, expect, it } from 'vitest';
import { EffectSchema } from '../content/effects/effect-schemas.js';
import { runEffects } from '../content/effects/handlers.js';
import { makeTestCtx } from '../sim/test-ctx.js';
import { processScheduledAtTurnStart } from './scheduled-system.js';

const src = { weaponId: 't:w', ownerSnailId: 'a1' };
const strike = EffectSchema.parse({
  type: 'schedule',
  turns: 2,
  line: { count: 3, length: 8 },
  telegraph: { radius: 2 },
  effects: [{ type: 'damage', radius: 3, maxDamage: 30, falloff: 'flat' }],
});

describe('schedule effect', () => {
  it('queues one entry per line point, grouped, snapped to the ground and telegraphed', () => {
    const { ctx, events } = makeTestCtx();
    runEffects(ctx, [strike], { x: 20, y: 12, z: 20 }, src);
    const s = ctx.state.scheduled;
    expect(s.map((e) => e.id)).toEqual(['s1', 's2', 's3']);
    expect(new Set(s.map((e) => e.groupId))).toEqual(new Set(['g1']));
    expect(s.map((e) => e.position.x)).toEqual([16, 20, 24]);
    expect(s.every((e) => Math.abs(e.position.y - 5.5) < 0.2)).toBe(true);
    expect(s[0]?.telegraph).toEqual({ radius: 2, style: 'strike' });
    expect(events.filter((e) => e.type === 'scheduledCreated')).toHaveLength(3);
    expect(ctx.state.nextScheduledId).toBe(4);
  });

  it('counts turn starts, then fires in creation order and removes the entries', () => {
    const { ctx, events } = makeTestCtx();
    const b = ctx.state.teams[1]?.snails[0];
    runEffects(ctx, [strike], { x: 16, y: 6, z: 20 }, src);
    processScheduledAtTurnStart(ctx);
    expect(ctx.state.scheduled.map((e) => e.turnsLeft)).toEqual([1, 1, 1]);
    expect(b?.health).toBe(100);
    events.length = 0;
    processScheduledAtTurnStart(ctx);
    expect(ctx.state.scheduled).toEqual([]);
    expect(events.filter((e) => e.type === 'scheduledFired').map((e) => e.type)).toHaveLength(3);
    expect(events[0]).toMatchObject({ type: 'scheduledFired', scheduledId: 's1' });
    expect(b?.health).toBeLessThan(100);
  });

  it('a single schedule without a line makes one entry at the point', () => {
    const { ctx } = makeTestCtx();
    runEffects(
      ctx,
      [
        EffectSchema.parse({
          type: 'schedule',
          turns: 1,
          telegraph: { radius: 1, style: 'arrival' },
          effects: [{ type: 'move', mode: 'teleport' }],
        }),
      ],
      { x: 30, y: 6, z: 10 },
      src,
    );
    expect(ctx.state.scheduled).toHaveLength(1);
    processScheduledAtTurnStart(ctx);
    expect(ctx.state.teams[0]?.snails[0]?.position).toEqual({ x: 30, y: 6, z: 10 });
  });

  it('rejects a schedule nested inside a schedule', () => {
    const nested = {
      type: 'schedule',
      turns: 1,
      telegraph: { radius: 1 },
      effects: [{ type: 'schedule', turns: 1, telegraph: { radius: 1 }, effects: [] }],
    };
    expect(EffectSchema.safeParse(nested).success).toBe(false);
  });
});
