import { describe, expect, it } from 'vitest';
import type { GameSnapshot, SimEvent } from '@snails/core';
import { KillFeed, activeLabel, rosterNamer, teamHealth, windLabel } from './hud';
import {
  RefreshGate,
  makeProjection,
  minimapDots,
  sampleHeights,
  silhouetteRgba,
  windArrow,
} from './minimap';

function snail(id: string, health: number, alive = true): Record<string, unknown> {
  return { id, name: `S-${id}`, health, maxHealth: 100, alive, position: { x: 10, y: 1, z: 20 } };
}

function snap(): GameSnapshot {
  return {
    teams: [
      { id: 't1', name: 'Red', colour: '#f00', snails: [snail('a', 100), snail('b', 50)] },
      { id: 't2', name: 'Blue', colour: '#00f', snails: [snail('c', 30, false)] },
    ],
    turn: { activeTeamId: 't1', activeSnailId: 'b' },
    projectiles: [{ position: { x: 40, y: 5, z: 40 } }],
    wind: { strength: 3.24, direction: Math.PI * 0.75 },
  } as unknown as GameSnapshot;
}

describe('hud', () => {
  it('aggregates team health and flags the active team', () => {
    const h = teamHealth(snap());
    expect(h[0]).toMatchObject({ hp: 150, maxHp: 200, fraction: 0.75, active: true });
    expect(h[1]).toMatchObject({ hp: 0, fraction: 0, active: false });
  });

  it('keeps the largest denominator when snails vanish', () => {
    const seen = new Map<string, number>();
    teamHealth(snap(), seen);
    const s = snap();
    (s.teams[0] as { snails: unknown[] }).snails = [snail('a', 100)];
    expect(teamHealth(s, seen)[0]?.fraction).toBe(0.5);
  });

  it('names the active snail and formats wind', () => {
    expect(activeLabel(snap())).toEqual({ team: 'Red', snail: 'S-b' });
    expect(windLabel({ strength: 3.24, direction: Math.PI * 0.75 })).toBe('3.2 NW');
    expect(windLabel({ strength: 0, direction: 1 })).toBe('Calm');
  });

  it('builds a kill feed with killer attribution, expiry and capacity', () => {
    const name = rosterNamer([
      {
        snails: [
          { id: 'a', name: 'Al' },
          { id: 'b', name: 'Bo' },
        ],
      },
    ]);
    const feed = new KillFeed(1000, 2);
    const ev = (e: unknown): SimEvent => e as SimEvent;
    feed.push(
      [
        ev({
          type: 'snailDamaged',
          snailId: 'b',
          sourceSnailId: 'a',
          amount: 1,
          remaining: 0,
          cause: 'explosion',
        }),
        ev({ type: 'snailDied', snailId: 'b', teamId: 't', cause: 'explosion' }),
        ev({ type: 'snailDied', snailId: 'a', teamId: 't', cause: 'drown' }),
        ev({ type: 'snailDied', snailId: 'z', teamId: 't', cause: 'fall' }),
        ev({ type: 'tick', tick: 1 }),
      ],
      0,
      name,
    );
    expect(feed.visible(10)).toEqual(['Al drowned', 'z fell to their death']);
    expect(feed.visible(1001)).toEqual([]);
  });
});

describe('minimap', () => {
  it('projects world to map and back', () => {
    const p = makeProjection(100, 50, 100, 100);
    const m = p.toMap(100, 50);
    expect(m).toEqual({ x: 100, y: 75 });
    expect(p.toWorld(m.x, m.y)).toEqual({ x: 100, z: 50 });
    expect(p.toMap(0, 0).y).toBe(25);
  });

  it('samples the topmost solid cell per column', () => {
    const nx = 2;
    const ny = 4;
    const nz = 2;
    const data = new Float32Array(nx * ny * nz).fill(1);
    for (let y = 0; y <= 2; y++) data[0 + nx * (y + ny * 0)] = -1;
    const h = sampleHeights({ nx, ny, nz, cellSize: 1, data }, 2, 2);
    expect(h[0]).toBe(1 + Math.floor((2 / 3) * 254));
    expect(h[1]).toBe(0);
    const rgba = silhouetteRgba(h);
    expect(rgba[3]).toBe(255);
    expect(rgba[7]).toBe(0);
  });

  it('places dots, skipping dead snails, and marks the active one', () => {
    const dots = minimapDots(snap(), makeProjection(100, 100, 100, 100));
    expect(dots.filter((d) => d.kind === 'snail')).toHaveLength(2);
    expect(dots.find((d) => d.active)?.colour).toBe('#f00');
    expect(dots.find((d) => d.kind === 'projectile')).toMatchObject({ x: 40, y: 40 });
  });

  it('wind arrow follows the facing convention and clamps length', () => {
    const w = windArrow({ strength: 50, direction: Math.PI / 2 });
    expect(w.dx).toBeCloseTo(0);
    expect(w.dy).toBeCloseTo(-1);
    expect(w.length).toBe(1);
  });

  it('RefreshGate throttles dirty refreshes', () => {
    let t = 0;
    const g = new RefreshGate(500, () => t);
    expect(g.due()).toBe(true);
    expect(g.due()).toBe(false);
    g.request();
    t = 100;
    expect(g.due()).toBe(false);
    t = 600;
    expect(g.due()).toBe(true);
  });
});
