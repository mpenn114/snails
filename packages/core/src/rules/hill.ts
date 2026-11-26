import { roundOf } from '../crate/crate-drop.js';
import { livingSnailsOfTeam } from '../entities/snail.js';
import type { Rng } from '../rng.js';
import type { Simulation } from '../sim/simulation.js';
import type { SimEvent } from '../sim/events.js';
import type { SimContext } from '../sim/types.js';
import type { GameState, HillState, MatchStatus, Vec3 } from '../state/types.js';
import { rayCast } from '../terrain/collision.js';
import { groundIsOpen } from '../terrain/reachability.js';
import type { SdfGrid } from '../terrain/sdf-grid.js';

/** Radius in metres of the Dewdrop Zone. */
export const HILL_RADIUS = 3;
/** Vertical reach (metres above and below the zone centre) of the zone column. */
export const HILL_HEIGHT = 4;
/** Score that wins a King of the Hill match. */
export const HILL_TARGET = 30;
/** The zone relocates at the start of every this-many-th round. */
export const HILL_RELOCATE_ROUNDS = 3;
/** Extra points for a team that holds the zone alone. */
export const HILL_SOLO_BONUS = 2;

const EDGE_MARGIN = 6;
const ATTEMPTS = 40;
const MIN_ABOVE_WATER = 1;
const MIN_NORMAL_Y = 0.7;

type Emit = (e: SimEvent) => void;

/** Picks a dry, fairly flat, walkable ground point (not an islet or ledge); prefers one away from `avoid`. Consumes 2 draws per try. */
function pickSite(grid: SdfGrid, waterLevel: number, rng: Rng, avoid: Vec3 | null): Vec3 | null {
  const cs = grid.cellSize;
  const topY = (grid.ny - 1) * cs - 0.5;
  let near: Vec3 | null = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    const x = rng.range(EDGE_MARGIN * cs, (grid.nx - 1 - EDGE_MARGIN) * cs);
    const z = rng.range(EDGE_MARGIN * cs, (grid.nz - 1 - EDGE_MARGIN) * cs);
    const hit = rayCast(grid, { x, y: topY, z }, { x: 0, y: -1, z: 0 }, topY + 1);
    if (!hit || hit.distance <= 0) continue;
    if (hit.point.y < waterLevel + MIN_ABOVE_WATER || hit.normal.y < MIN_NORMAL_Y) continue;
    if (!groundIsOpen(grid, waterLevel, hit.point)) continue;
    if (avoid && Math.hypot(hit.point.x - avoid.x, hit.point.z - avoid.z) < HILL_RADIUS * 3) {
      near ??= hit.point;
      continue;
    }
    return { ...hit.point };
  }
  return near ? { ...near } : null;
}

/**
 * Places the first zone (from `rng`, normally the terrain stream) and sets `state.hill`.
 * Falls back to the map centre when no dry flat spot is found. Deterministic per seed.
 */
export function initHill(state: GameState, grid: SdfGrid, rng: Rng): void {
  const cs = grid.cellSize;
  const fallback = {
    x: (grid.nx * cs) / 2,
    y: state.terrain.waterLevel + 1,
    z: (grid.nz * cs) / 2,
  };
  const scores: Record<string, number> = {};
  for (const t of state.teams) scores[t.id] = 0;
  state.hill = {
    position: pickSite(grid, state.terrain.waterLevel, rng, null) ?? fallback,
    radius: HILL_RADIUS,
    scores,
    target: HILL_TARGET,
  };
}

/** Living snails per team id inside the zone column (teams with none are omitted). */
function holders(state: GameState, hill: HillState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const team of state.teams) {
    const n = livingSnailsOfTeam(state, team.id).filter((s) => {
      const d = Math.hypot(s.position.x - hill.position.x, s.position.z - hill.position.z);
      return d <= hill.radius && Math.abs(s.position.y - hill.position.y) <= HILL_HEIGHT;
    }).length;
    if (n > 0) counts.set(team.id, n);
  }
  return counts;
}

/**
 * End-of-turn scoring: the team whose turn ended scores 1 point per snail in the zone, plus
 * `HILL_SOLO_BONUS` when it is the only team with snails there. Emits `hillScored` when points
 * were awarded. No-op without `state.hill`.
 */
export function scoreHill(state: GameState, teamId: string | null, emit: Emit): void {
  const hill = state.hill;
  if (!hill || teamId === null) return;
  const inside = holders(state, hill);
  const own = inside.get(teamId) ?? 0;
  if (own === 0) return;
  const points = own + (inside.size === 1 ? HILL_SOLO_BONUS : 0);
  const total = (hill.scores[teamId] ?? 0) + points;
  hill.scores[teamId] = total;
  emit({ type: 'hillScored', teamId, points, total });
}

/**
 * King of the Hill win rule: the first team (in team order) at or above the target score wins.
 * Pure; `playing` without `state.hill`.
 */
export function evaluateHill(state: GameState): MatchStatus {
  const hill = state.hill;
  const winner = hill && state.teams.find((t) => (hill.scores[t.id] ?? 0) >= hill.target);
  if (!winner) return { status: 'playing', winnerTeamId: null };
  return { status: 'won', winnerTeamId: winner.id, reason: 'hill' };
}

/** Turn-start hook body: relocates the zone on the first turn of every third round (after 1). */
export function relocateHill(ctx: SimContext, turnNumber: number): void {
  const hill = ctx.state.hill;
  const teams = Math.max(1, ctx.state.teams.length);
  if (!hill || (turnNumber - 1) % teams !== 0) return;
  const round = roundOf(ctx.state);
  if (round <= 1 || (round - 1) % HILL_RELOCATE_ROUNDS !== 0) return;
  const site = pickSite(ctx.terrain, ctx.state.terrain.waterLevel, ctx.rng.terrain, hill.position);
  if (!site) return;
  hill.position = site;
  ctx.emit({ type: 'hillMoved', position: { ...site }, radius: hill.radius });
}

/** Registers the zone relocation turn-start hook. */
export function registerHill(sim: Simulation): void {
  sim.registerTurnStartHook('hill', (ctx, info) => relocateHill(ctx, info.turnNumber));
}
