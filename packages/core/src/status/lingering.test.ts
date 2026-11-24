import { describe, expect, it } from 'vitest';
import { processAreasAtTurnStart, spawnArea } from '../area/area-system.js';
import type { AreaDefinition, StatusDefinition } from '../content/types.js';
import { makeTestCtx } from '../sim/test-ctx.js';
import {
  applyStatus,
  processStatusesAtTurnStart,
  statusMoveSpeedMultiplier,
} from './status-system.js';

const SALT: StatusDefinition = { id: 't:salt', name: 'Salt', perTurnDamage: 4 };
const SLOW: StatusDefinition = { id: 't:slow', name: 'Slow', moveSpeedMultiplier: 0.5 };
const WASH: StatusDefinition = { id: 't:wash', name: 'Wash', cures: ['t:salt'] };

function setup(areas: AreaDefinition[] = []) {
  const t = makeTestCtx({ statuses: [SALT, SLOW, WASH], areas });
  const [a, b] = [t.ctx.state.teams[0]?.snails[0], t.ctx.state.teams[1]?.snails[0]];
  if (!a || !b) throw new Error('setup');
  t.ctx.state.turn.activeTeamId = 'b';
  t.ctx.state.turn.activeSnailId = 'b1';
  return { ...t, a, b };
}

describe('statuses', () => {
  it('ticks damage for N turns of the afflicted team, then expires', () => {
    const { ctx, events, b } = setup();
    applyStatus(ctx, b, SALT, { turns: 2, sourceSnailId: 'a1' });
    processStatusesAtTurnStart(ctx, ctx.content.statuses);
    expect(b.health).toBe(96);
    expect(b.statuses?.[0]?.turnsLeft).toBe(1);
    processStatusesAtTurnStart(ctx, ctx.content.statuses);
    expect(b.health).toBe(92);
    expect(b.statuses).toEqual([]);
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === 'snailDamaged')).toHaveLength(2);
    expect(types.at(-1)).toBe('statusExpired');
    expect(events.find((e) => e.type === 'snailDamaged')).toMatchObject({
      cause: 'status',
      sourceSnailId: 'a1',
    });
  });

  it('does not tick snails of the other team', () => {
    const { ctx, a } = setup();
    applyStatus(ctx, a, SALT, { turns: 2, sourceSnailId: 'b1' });
    processStatusesAtTurnStart(ctx, ctx.content.statuses);
    expect(a.health).toBe(100);
  });

  it('refreshes instead of stacking, and cures remove other statuses', () => {
    const { ctx, b } = setup();
    applyStatus(ctx, b, SALT, { turns: 1, sourceSnailId: 'a1' });
    applyStatus(ctx, b, SALT, { turns: 3, magnitude: 2, sourceSnailId: 'a1' });
    expect(b.statuses).toEqual([{ id: 't:salt', turnsLeft: 3, magnitude: 2, sourceSnailId: 'a1' }]);
    applyStatus(ctx, b, WASH, { turns: 1, sourceSnailId: 'a1' });
    expect(b.statuses?.map((s) => s.id)).toEqual(['t:wash']);
  });

  it('kills with cause status, skips the dead active turn and clears statuses', () => {
    const { ctx, events, b } = setup();
    b.health = 3;
    applyStatus(ctx, b, SALT, { turns: 2, sourceSnailId: 'a1' });
    processStatusesAtTurnStart(ctx, ctx.content.statuses);
    expect(b.alive).toBe(false);
    expect(b.statuses).toEqual([]);
    expect(events.some((e) => e.type === 'snailDied' && e.cause === 'status')).toBe(true);
    expect(ctx.state.turn.phase).toBe('settle');
  });

  it('removes unknown statuses and multiplies move speed', () => {
    const { ctx, b } = setup();
    b.statuses = [{ id: 'x:gone', turnsLeft: 2, magnitude: 1, sourceSnailId: 'a1' }];
    processStatusesAtTurnStart(ctx, ctx.content.statuses);
    expect(b.statuses).toEqual([]);
    applyStatus(ctx, b, SLOW, { turns: 1, sourceSnailId: 'a1' });
    expect(statusMoveSpeedMultiplier(b, ctx.content.statuses)).toBe(0.5);
  });

  it('ignores dead snails', () => {
    const { ctx, events, a } = setup();
    a.alive = false;
    applyStatus(ctx, a, SALT, { turns: 1, sourceSnailId: 'b1' });
    expect(events).toHaveLength(0);
  });
});

describe('areas', () => {
  const GAS: AreaDefinition = {
    id: 't:gas',
    name: 'Gas',
    defaultRadius: 3,
    defaultTurns: 2,
    perTurnDamage: 6,
    applyStatus: { statusId: 't:salt', turns: 1 },
    windDrift: 2,
  };
  const FLOOD: AreaDefinition = {
    id: 't:flood',
    name: 'Flood',
    defaultRadius: 3,
    defaultTurns: 1,
    drowns: true,
  };

  it('damages and afflicts snails inside every turn start, then expires', () => {
    const { ctx, events, a, b } = setup([GAS]);
    spawnArea(ctx, GAS, { position: { x: 20, y: 6, z: 20 }, sourceSnailId: 'a1' });
    processAreasAtTurnStart(ctx, ctx.content);
    expect(b.health).toBe(94);
    expect(a.health).toBe(100);
    expect(b.statuses?.[0]?.id).toBe('t:salt');
    expect(ctx.state.areas).toHaveLength(1);
    processAreasAtTurnStart(ctx, ctx.content);
    expect(b.health).toBe(88);
    expect(ctx.state.areas).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: 'areaExpired', kind: 't:gas' });
    expect(events.find((e) => e.type === 'snailDamaged')).toMatchObject({ cause: 'area' });
  });

  it('drifts downwind by windDrift metres per unit of strength', () => {
    const { ctx, events } = setup([GAS]);
    ctx.state.wind = { strength: 3, direction: 0 };
    spawnArea(ctx, GAS, { position: { x: 5, y: 6, z: 5 }, sourceSnailId: 'a1' });
    processAreasAtTurnStart(ctx, ctx.content);
    expect(ctx.state.areas[0]?.position.x).toBeCloseTo(11);
    expect(events.some((e) => e.type === 'areaMoved')).toBe(true);
  });

  it('drowns snails inside and skips the dead active turn', () => {
    const { ctx, events, b } = setup([FLOOD]);
    spawnArea(ctx, FLOOD, { position: { x: 20, y: 6, z: 20 }, sourceSnailId: 'a1' });
    processAreasAtTurnStart(ctx, ctx.content);
    expect(b.alive).toBe(false);
    expect(events.map((e) => e.type)).toContain('snailDrowned');
    expect(ctx.state.turn.phase).toBe('settle');
  });

  it('removes areas whose definition is unknown', () => {
    const { ctx } = setup();
    spawnArea(ctx, GAS, { position: { x: 1, y: 6, z: 1 }, sourceSnailId: 'a1' });
    processAreasAtTurnStart(ctx, ctx.content);
    expect(ctx.state.areas).toHaveLength(0);
  });
});
