import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SnailLayer } from './snail-layer.js';
import { snailViewsFromSnapshot, type SnailView } from './snail-view.js';

const view = (id: string, over: Partial<SnailView> = {}): SnailView => ({
  id,
  teamId: 't0',
  teamIndex: 0,
  colour: 0xff0000,
  position: { x: 0, y: 0, z: 0 },
  facing: 0,
  health: 50,
  maxHealth: 100,
  alive: true,
  name: id,
  isActive: false,
  ...over,
});

const makeLayer = (): SnailLayer => new SnailLayer({ labelFactory: () => new THREE.Texture() });

describe('SnailLayer animation and reactions', () => {
  const zero = { x: 0, y: 0, z: 0 };
  it('reacts to damage, firing, nearby explosions and victory', () => {
    const layer = makeLayer();
    const far = { x: 100, y: 0, z: 0 };
    const views = [view('a', { position: zero }), view('b', { teamId: 't1', position: far })];
    layer.sync(views);
    layer.handleEvents([
      {
        type: 'snailDamaged',
        snailId: 'a',
        amount: 30,
        remaining: 20,
        sourceSnailId: null,
        cause: 'explosion',
      },
      {
        type: 'projectileFired',
        projectileId: 'p',
        weaponId: 'w',
        snailId: 'b',
        position: zero,
        velocity: zero,
      },
      { type: 'explosion', position: { x: 1, y: 0, z: 0 }, radius: 3, weaponId: 'w' },
      { type: 'matchEnded', status: 'won', winnerTeamId: 't1' },
    ]);
    const a = layer.get('a')!;
    const b = layer.get('b')!;
    expect(a.expression.busy).toBe(true);
    expect(b.expression.busy).toBe(true);
    layer.sync(views, 0.05);
    // a was hurt and scared: stalks pulled in, squashed, squinting.
    expect(a.rig.stalks[0].scale.y).toBeLessThan(1);
    expect(a.rig.squash.scale.y).toBeLessThan(0.9);
    expect(a.rig.lids[0].visible).toBe(true);
    // b is out of the blast range: stalks are not retracted.
    expect(b.rig.stalks[0].scale.y).toBeGreaterThanOrEqual(1);
  });

  it('animates body motion from position deltas', () => {
    const layer = makeLayer();
    let x = 0;
    let lo = 9;
    let hi = 0;
    for (let i = 0; i < 200; i++) {
      x += 1.2 / 60;
      layer.sync([view('a', { position: { x, y: 0, z: 0 } })], 1 / 60);
      if (i > 80) {
        const s = layer.get('a')!.rig.squash.scale.x;
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
      }
    }
    expect(hi - lo).toBeGreaterThan(0.05);
  });

  it('squashes on landing events and stays at rest pose with dt zero', () => {
    const layer = makeLayer();
    layer.sync([view('a')]);
    expect(layer.get('a')!.rig.squash.scale.y).toBeCloseTo(1, 1);
    layer.handleEvents([{ type: 'snailLanded', snailId: 'a', impactSpeed: 10, fallDistance: 5 }]);
    layer.sync([view('a')], 0.016);
    expect(layer.get('a')!.rig.squash.scale.y).toBeLessThan(0.9);
  });

  it('ignores unknown snails and unrelated events', () => {
    const layer = makeLayer();
    layer.handleEvents([
      { type: 'snailLanded', snailId: 'nobody', impactSpeed: 1, fallDistance: 1 },
      { type: 'tick', tick: 1 },
    ]);
    expect(layer.size).toBe(0);
  });
});

describe('snail view animation fields', () => {
  it('derives aiming, aim angle, grounded and retreating from the snapshot', () => {
    const snail = (id: string, extra: object): object => ({
      id,
      name: id,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      facing: 0,
      health: 10,
      maxHealth: 10,
      alive: true,
      shell: { upgradeId: null, colour: '#fff' },
      ...extra,
    });
    const build = (phase: string): Parameters<typeof snailViewsFromSnapshot>[0] =>
      ({
        teams: [
          {
            id: 't',
            name: 't',
            colour: '#ff0000',
            researched: [],
            nextSnailIndex: 0,
            snails: [
              snail('a', { teamId: 't', aim: { angle: 0.5, power: 1 }, grounded: false }),
              snail('b', { teamId: 't' }),
            ],
          },
        ],
        turn: { activeSnailId: 'a', phase, fired: false },
      }) as unknown as Parameters<typeof snailViewsFromSnapshot>[0];
    const [a, b] = snailViewsFromSnapshot(build('action')) as [SnailView, SnailView];
    expect(a).toMatchObject({ aiming: true, aimAngle: 0.5, grounded: false, retreating: false });
    expect(b).toMatchObject({ aiming: false, grounded: true });
    const [r] = snailViewsFromSnapshot(build('retreat')) as [SnailView];
    expect(r).toMatchObject({ aiming: false, retreating: true });
  });
});
