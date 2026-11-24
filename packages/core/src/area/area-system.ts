import type { ContentRegistry } from '../content/registry.js';
import type { AreaDefinition, StatusDefinition } from '../content/types.js';
import { applyDamage, livingSnails } from '../entities/snail.js';
import { distance } from '../math/vec3.js';
import { windAcceleration } from '../physics/ballistics.js';
import { SNAIL_RADIUS } from '../physics/projectile-system.js';
import type { SimContext } from '../sim/types.js';
import { applyStatus } from '../status/status-system.js';
import type { AreaInstance, Snail, Vec3 } from '../state/types.js';
import { skipTurnIfActiveDead } from '../turn/turn-hooks.js';
import { applyWater, findLowPoint, isWaterArea, waterSurfaceY } from './water-area.js';

/** Overrides when creating an area. */
export interface AreaSpawn {
  position: Vec3;
  radius?: number;
  turns?: number;
  sourceSnailId: string;
}

/**
 * Creates an area from its definition (id `a<counter>`) and emits `areaCreated`. A water area
 * (`waterDepth`) settles to the lowest terrain within its radius first and is only as deep as
 * the lowest point of its rim allows (see `waterSurfaceY`).
 */
export function spawnArea(ctx: SimContext, def: AreaDefinition, spawn: AreaSpawn): AreaInstance {
  const radius = spawn.radius ?? def.defaultRadius;
  let position = { ...spawn.position };
  if (def.waterDepth !== undefined) {
    const low = findLowPoint(ctx.terrain, position, radius);
    position = { x: low.x, y: waterSurfaceY(ctx.terrain, low, radius, def.waterDepth), z: low.z };
  }
  const area: AreaInstance = {
    id: `a${ctx.state.nextAreaId}`,
    kind: def.id,
    position,
    radius,
    turnsLeft: spawn.turns ?? def.defaultTurns,
    sourceSnailId: spawn.sourceSnailId,
  };
  ctx.state.nextAreaId += 1;
  ctx.state.areas.push(area);
  ctx.emit({
    type: 'areaCreated',
    areaId: area.id,
    kind: area.kind,
    position: { ...area.position },
    radius: area.radius,
    turnsLeft: area.turnsLeft,
  });
  return area;
}

/** Registries an area needs to resolve its per-turn effects. */
export interface AreaRegistries {
  areas: ContentRegistry<AreaDefinition>;
  statuses: ContentRegistry<StatusDefinition>;
}

function affect(
  ctx: SimContext,
  area: AreaInstance,
  def: AreaDefinition,
  snail: Snail,
  statuses: ContentRegistry<StatusDefinition>,
): void {
  if (def.drowns === true) {
    snail.alive = false;
    snail.health = 0;
    ctx.emit({ type: 'snailDrowned', snailId: snail.id });
    ctx.emit({ type: 'snailDied', snailId: snail.id, teamId: snail.teamId, cause: 'drown' });
    return;
  }
  const result = applyDamage(snail, def.perTurnDamage ?? 0);
  if (result.dealt > 0) {
    ctx.emit({
      type: 'snailDamaged',
      snailId: snail.id,
      amount: result.dealt,
      remaining: snail.health,
      sourceSnailId: area.sourceSnailId,
      cause: 'area',
    });
  }
  if (result.killed) {
    ctx.emit({ type: 'snailDied', snailId: snail.id, teamId: snail.teamId, cause: 'area' });
    return;
  }
  const app = def.applyStatus;
  const status = app ? statuses.get(app.statusId) : undefined;
  if (app && status) {
    applyStatus(ctx, snail, status, {
      turns: app.turns ?? status.defaultTurns ?? 1,
      magnitude: app.magnitude ?? 1,
      sourceSnailId: area.sourceSnailId,
    });
  }
}

function drift(ctx: SimContext, area: AreaInstance, def: AreaDefinition): void {
  const k = def.windDrift ?? 0;
  if (!(k > 0)) return;
  const w = windAcceleration(ctx.state.wind);
  const x = area.position.x + w.x * k;
  const z = area.position.z + w.z * k;
  if (x === area.position.x && z === area.position.z) return;
  area.position = { x, y: area.position.y, z };
  ctx.emit({ type: 'areaMoved', areaId: area.id, position: { ...area.position } });
}

/**
 * Turn-start hook body. For every area, in creation order: drift with the wind (`windDrift`
 * metres per unit of wind strength), then affect each living snail inside (per-turn damage,
 * status, drowning), then spend one turn and remove it at 0. Areas count every turn start,
 * whichever team's; they affect all snails inside. If the active snail dies, its turn is skipped.
 */
export function processAreasAtTurnStart(ctx: SimContext, r: AreaRegistries): void {
  for (const area of [...ctx.state.areas]) {
    const def = r.areas.get(area.kind);
    if (def) {
      drift(ctx, area, def);
      if (isWaterArea(def)) applyWater(ctx, area, def);
      else
        for (const snail of livingSnails(ctx.state)) {
          if (distance(area.position, snail.position) <= area.radius + SNAIL_RADIUS) {
            affect(ctx, area, def, snail, r.statuses);
          }
        }
    }
    area.turnsLeft -= 1;
    if (area.turnsLeft <= 0 || !def) {
      ctx.state.areas = ctx.state.areas.filter((a) => a.id !== area.id);
      ctx.emit({ type: 'areaExpired', areaId: area.id, kind: area.kind });
    }
  }
  skipTurnIfActiveDead(ctx);
}
