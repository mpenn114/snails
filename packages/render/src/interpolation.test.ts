import type { GameSnapshot } from '@snails/core';
import { describe, expect, it } from 'vitest';
import { SnapshotBuffer, interpolateSnapshots, lerpAngle } from './interpolation.js';

function snap(tick: number, x = tick, facing = 0, health = 100): GameSnapshot {
  const snail = {
    id: 'a',
    position: { x, y: 0, z: 0 },
    facing,
    health,
  };
  return {
    tick,
    teams: [{ id: 't', snails: [snail] }],
    projectiles: [],
  } as unknown as GameSnapshot;
}

function setup(delayTicks = 2) {
  let t = 0;
  const buf = new SnapshotBuffer({ now: () => t, tickMs: 10, delayTicks });
  return { buf, advance: (ms: number) => (t += ms) };
}

const proj = {
  id: 'p1',
  position: { x: 4, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  ownerSnailId: 'a',
  weaponId: 'w',
  radius: 1,
  age: 0,
  maxAge: 1,
  gravityScale: 1,
  windScale: 1,
};

describe('lerpAngle', () => {
  it('takes the shortest arc', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(3 + (Math.PI * 2 - 6) / 2);
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5);
  });
});

describe('interpolateSnapshots', () => {
  it('lerps positions and facing; holds health until alpha 1', () => {
    const r = interpolateSnapshots(snap(0, 0, 0, 100), snap(1, 10, 1, 50), 0.5);
    const s = r.teams[0]!.snails[0]!;
    expect(s.position.x).toBeCloseTo(5);
    expect(s.facing).toBeCloseTo(0.5);
    expect(s.health).toBe(100);
    const end = interpolateSnapshots(snap(0, 0, 0, 100), snap(1, 10, 1, 50), 1);
    expect(end.teams[0]!.snails[0]!.health).toBe(50);
  });

  it('snaps teleports', () => {
    const r = interpolateSnapshots(snap(0, 0), snap(1, 100), 0.5);
    expect(r.teams[0]!.snails[0]!.position.x).toBe(0);
  });

  it('handles entities present in only one snapshot', () => {
    const a = snap(0);
    const b = snap(1);
    b.projectiles.push(proj);
    expect(interpolateSnapshots(a, b, 0.5).projectiles[0]!.position.x).toBe(4);
    expect(interpolateSnapshots(b, a, 0.5).projectiles).toHaveLength(0);
    const c = snap(2);
    c.projectiles.push({ ...proj, position: { x: 8, y: 0, z: 0 } });
    expect(interpolateSnapshots(b, c, 0.5).projectiles[0]!.position.x).toBe(6);
  });
});

describe('SnapshotBuffer', () => {
  it('is empty initially and after reset', () => {
    const { buf } = setup();
    expect(buf.getState()).toBeNull();
    buf.push(snap(1));
    buf.reset();
    expect(buf.getState()).toBeNull();
    expect(buf.size).toBe(0);
  });

  it('holds a single snapshot', () => {
    const { buf } = setup();
    const s = snap(5);
    buf.push(s);
    const v = buf.getState()!;
    expect(v.snapshot).toBe(s);
    expect(v.alpha).toBe(1);
  });

  it('drops duplicates and older snapshots', () => {
    const { buf } = setup();
    expect(buf.push(snap(2))).toBe(true);
    expect(buf.push(snap(2))).toBe(false);
    expect(buf.push(snap(1))).toBe(false);
    expect(buf.size).toBe(1);
  });

  it('bounds capacity', () => {
    const buf = new SnapshotBuffer({ now: () => 0, capacity: 3 });
    for (let i = 0; i < 10; i++) buf.push(snap(i));
    expect(buf.size).toBe(3);
  });

  it('interpolates between bracketing snapshots with delay', () => {
    const { buf, advance } = setup(2);
    for (let i = 0; i < 4; i++) buf.push(snap(i, i * 10));
    advance(5); // render tick = 3 + 0.5 - 2 = 1.5
    const v = buf.getState()!;
    expect(v.prev.tick).toBe(1);
    expect(v.next.tick).toBe(2);
    expect(v.alpha).toBeCloseTo(0.5);
    expect(v.snapshot.teams[0]!.snails[0]!.position.x).toBeCloseTo(15);
  });

  it('holds newest when render time is ahead (no extrapolation)', () => {
    const { buf, advance } = setup(0);
    buf.push(snap(0, 0));
    buf.push(snap(1, 10));
    advance(1000);
    const v = buf.getState()!;
    expect(v.snapshot.tick).toBe(1);
    expect(v.alpha).toBe(1);
  });

  it('holds oldest when render time precedes the buffer', () => {
    const { buf } = setup(10);
    buf.push(snap(5, 0));
    buf.push(snap(6, 10));
    expect(buf.getState()!.snapshot.tick).toBe(5);
  });

  it('snaps across large tick gaps', () => {
    const { buf } = setup(50);
    buf.push(snap(0, 0));
    buf.push(snap(100, 50));
    const v = buf.getState()!;
    expect(v.snapshot.tick).toBe(100);
    expect(v.alpha).toBe(1);
  });
});
