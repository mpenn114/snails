import { describe, expect, it } from 'vitest';
import type { GameState } from '../state/types.js';
import { createInitialState } from '../state/game-state.js';
import {
  DEFAULT_SNAIL_HEALTH,
  applyDamage,
  createSnail,
  facingVector,
  findSnail,
  heal,
  kill,
  livingSnails,
  livingSnailsOfTeam,
  setFacing,
} from './snail.js';

const base = { id: 's', teamId: 't', name: 'Snail' };

const makeState = (): GameState =>
  createInitialState({
    seed: 1,
    terrain: { nx: 4, ny: 4, nz: 4 },
    teams: [
      {
        id: 'a',
        name: 'A',
        colour: '#f00',
        snails: [
          { id: 'a1', name: 'a1' },
          { id: 'a2', name: 'a2' },
        ],
      },
      {
        id: 'b',
        name: 'B',
        colour: '#00f',
        snails: [
          { id: 'b1', name: 'b1' },
          { id: 'b2', name: 'b2' },
        ],
      },
    ],
  });

describe('createSnail', () => {
  it('uses sensible defaults', () => {
    const s = createSnail(base);
    expect(s.health).toBe(DEFAULT_SNAIL_HEALTH);
    expect(s.maxHealth).toBe(DEFAULT_SNAIL_HEALTH);
    expect(s.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.facing).toBe(0);
    expect(s.alive).toBe(true);
    expect(s.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.shell).toEqual({ upgradeId: null, colour: '' });
  });

  it('copies position and shell rather than aliasing them', () => {
    const position = { x: 1, y: 2, z: 3 };
    const shell = { upgradeId: 'x', colour: '#abc' };
    const s = createSnail({ ...base, position, shell });
    position.x = 99;
    shell.colour = 'changed';
    expect(s.position.x).toBe(1);
    expect(s.shell).toEqual({ upgradeId: 'x', colour: '#abc' });
  });

  it('applies colour to the default shell and honours maxHealth/health', () => {
    const s = createSnail({ ...base, colour: '#123', maxHealth: 50, health: 20 });
    expect(s.shell.colour).toBe('#123');
    expect(s.maxHealth).toBe(50);
    expect(s.health).toBe(20);
  });

  it('clamps starting health and marks zero-health snails dead', () => {
    expect(createSnail({ ...base, health: 500, maxHealth: 100 }).health).toBe(100);
    const dead = createSnail({ ...base, health: 0 });
    expect(dead.health).toBe(0);
    expect(dead.alive).toBe(false);
  });

  it('normalises the initial facing', () => {
    expect(createSnail({ ...base, facing: 3 * Math.PI }).facing).toBeCloseTo(-Math.PI);
  });
});

describe('applyDamage', () => {
  it('reduces health and reports dealt damage', () => {
    const s = createSnail({ ...base, maxHealth: 100 });
    expect(applyDamage(s, 30)).toEqual({ dealt: 30, killed: false });
    expect(s.health).toBe(70);
    expect(s.alive).toBe(true);
  });

  it('clamps at zero, kills, and reports only the health removed', () => {
    const s = createSnail({ ...base, maxHealth: 100, health: 40 });
    expect(applyDamage(s, 1000)).toEqual({ dealt: 40, killed: true });
    expect(s.health).toBe(0);
    expect(s.alive).toBe(false);
  });

  it('does not report a second kill on a dead snail', () => {
    const s = createSnail({ ...base });
    applyDamage(s, 100);
    expect(applyDamage(s, 10)).toEqual({ dealt: 0, killed: false });
    expect(s.health).toBe(0);
  });

  it('ignores zero, negative and non-finite amounts', () => {
    const s = createSnail({ ...base });
    expect(applyDamage(s, 0)).toEqual({ dealt: 0, killed: false });
    expect(applyDamage(s, -5)).toEqual({ dealt: 0, killed: false });
    expect(applyDamage(s, Number.NaN)).toEqual({ dealt: 0, killed: false });
    expect(applyDamage(s, Number.POSITIVE_INFINITY)).toEqual({ dealt: 0, killed: false });
    expect(s.health).toBe(DEFAULT_SNAIL_HEALTH);
  });
});

describe('heal', () => {
  it('restores health and returns the amount restored', () => {
    const s = createSnail({ ...base, maxHealth: 100, health: 60 });
    expect(heal(s, 25)).toBe(25);
    expect(s.health).toBe(85);
  });

  it('clamps to maxHealth', () => {
    const s = createSnail({ ...base, maxHealth: 100, health: 90 });
    expect(heal(s, 50)).toBe(10);
    expect(s.health).toBe(100);
    expect(heal(s, 50)).toBe(0);
  });

  it('does not heal dead snails', () => {
    const s = createSnail({ ...base });
    kill(s);
    expect(heal(s, 50)).toBe(0);
    expect(s.health).toBe(0);
    expect(s.alive).toBe(false);
  });

  it('ignores non-positive and non-finite amounts', () => {
    const s = createSnail({ ...base, maxHealth: 100, health: 50 });
    expect(heal(s, 0)).toBe(0);
    expect(heal(s, -10)).toBe(0);
    expect(heal(s, Number.NaN)).toBe(0);
    expect(s.health).toBe(50);
  });
});

describe('kill', () => {
  it('sets health to zero and alive to false', () => {
    const s = createSnail({ ...base, health: 80 });
    kill(s);
    expect(s.health).toBe(0);
    expect(s.alive).toBe(false);
  });
});

describe('setFacing', () => {
  it('stores angles already in range unchanged', () => {
    const s = createSnail({ ...base });
    setFacing(s, 1.2);
    expect(s.facing).toBeCloseTo(1.2);
  });

  it('wraps angles into [-PI, PI)', () => {
    const s = createSnail({ ...base });
    setFacing(s, Math.PI);
    expect(s.facing).toBeCloseTo(-Math.PI);
    setFacing(s, -Math.PI);
    expect(s.facing).toBeCloseTo(-Math.PI);
    setFacing(s, 5 * Math.PI);
    expect(s.facing).toBeCloseTo(-Math.PI);
    setFacing(s, -3 * Math.PI / 2);
    expect(s.facing).toBeCloseTo(Math.PI / 2);
    for (const a of [-100, -7, -0.1, 0, 0.1, 7, 100]) {
      setFacing(s, a);
      expect(s.facing).toBeGreaterThanOrEqual(-Math.PI);
      expect(s.facing).toBeLessThan(Math.PI);
    }
  });

  it('ignores non-finite angles', () => {
    const s = createSnail({ ...base });
    setFacing(s, 1);
    setFacing(s, Number.NaN);
    expect(s.facing).toBeCloseTo(1);
  });
});

describe('facingVector', () => {
  it('points along +X at facing 0', () => {
    const v = facingVector(createSnail({ ...base }));
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBe(0);
    expect(v.z).toBeCloseTo(0);
  });

  it('points along -Z at facing PI/2 (right-handed about +Y)', () => {
    const s = createSnail({ ...base });
    setFacing(s, Math.PI / 2);
    const v = facingVector(s);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(-1);
  });

  it('is a unit vector in the XZ plane', () => {
    const s = createSnail({ ...base });
    setFacing(s, 0.7);
    const v = facingVector(s);
    expect(v.x * v.x + v.z * v.z).toBeCloseTo(1);
    expect(v.y).toBe(0);
  });
});

describe('state queries', () => {
  it('findSnail locates snails across teams and returns undefined when absent', () => {
    const state = makeState();
    expect(findSnail(state, 'b2')?.teamId).toBe('b');
    expect(findSnail(state, 'nope')).toBeUndefined();
  });

  it('livingSnails returns living snails in team then snail order', () => {
    const state = makeState();
    kill(state.teams[0]!.snails[0]!);
    expect(livingSnails(state).map((s) => s.id)).toEqual(['a2', 'b1', 'b2']);
  });

  it('livingSnailsOfTeam filters to one team in snail order', () => {
    const state = makeState();
    kill(state.teams[1]!.snails[0]!);
    expect(livingSnailsOfTeam(state, 'b').map((s) => s.id)).toEqual(['b2']);
    expect(livingSnailsOfTeam(state, 'a').map((s) => s.id)).toEqual(['a1', 'a2']);
  });

  it('livingSnailsOfTeam returns empty for an unknown team', () => {
    expect(livingSnailsOfTeam(makeState(), 'zzz')).toEqual([]);
  });
});
