import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SdfGrid } from '@snails/core';
import type { GameSnapshot, SimEvent } from '@snails/core';
import { MatchRenderer } from './match-renderer.js';
import { createInProcessTransport } from './terrain/mesh-transport.js';
import { createGameViewWith } from './view.js';
import { CachedModelLoader } from './props/model-loader.js';

function makeGrid(): SdfGrid {
  const g = new SdfGrid(24, 24, 24, 1, 1, 8);
  for (let z = 0; z < 24; z++)
    for (let y = 0; y < 10; y++) for (let x = 0; x < 24; x++) g.set(x, y, z, y - 9.5);
  g.takeDirtyChunks();
  return g;
}

const snap = (tick: number, snails: number, projectiles: number): GameSnapshot =>
  ({
    tick,
    terrain: { nx: 24, ny: 24, nz: 24, cellSize: 1, waterLevel: 2 },
    teams: [
      {
        id: 't0',
        snails: Array.from({ length: snails }, (_, i) => ({
          id: `s${i}`,
          name: `s${i}`,
          position: { x: 5 + i, y: 10, z: 5 },
          facing: 0,
          health: 100,
          maxHealth: 100,
          alive: true,
        })),
      },
    ],
    turn: { activeSnailId: 's0' },
    projectiles: Array.from({ length: projectiles }, (_, i) => ({
      id: `p${i}`,
      position: { x: 6, y: 12, z: 6 },
      velocity: { x: 1, y: 0, z: 0 },
      ownerSnailId: 's0',
      weaponId: 'w',
      radius: 0.2,
      age: 0,
      fuse: 3,
    })),
  }) as unknown as GameSnapshot;

function setup(extra: Partial<ConstructorParameters<typeof MatchRenderer>[0]> = {}) {
  let time = 0;
  let frame: ((t: number) => void) | null = null;
  const render = vi.fn();
  const r = new MatchRenderer({
    now: () => time,
    random: () => 0.5,
    ...extra,
    labelFactory: () => new THREE.Texture(),
    makeTransport: () => createInProcessTransport({ sync: true }),
    makeView: ({ bounds, waterLevel }) =>
      createGameViewWith({
        tier: 'low',
        devicePixelRatio: 1,
        renderer: { render, setSize: vi.fn(), setPixelRatio: vi.fn(), dispose: vi.fn() },
        scheduler: {
          request: (cb) => ((frame = cb), 1),
          cancel: () => (frame = null),
        },
        now: () => time,
        terrainBounds: bounds,
        waterLevel,
      }),
  });
  const tick = (ms: number): void => {
    time += ms;
    frame?.(time);
  };
  return { r, tick, render };
}

describe('MatchRenderer', () => {
  it('is inert before init and remembers size', () => {
    const { r } = setup();
    expect(r.view).toBeNull();
    r.resize(100, 50);
    r.handleEvents([]);
    r.init({ grid: makeGrid(), waterLevel: 2 });
    expect(r.view).not.toBeNull();
    expect(r.cameraRig?.mode).toBe('follow');
  });

  it('meshes terrain and syncs snails/projectiles from pushed snapshots', () => {
    const { r, tick, render } = setup();
    r.init({ grid: makeGrid(), waterLevel: 2 });
    r.pushSnapshot(snap(1, 2, 1));
    tick(16);
    tick(16);
    expect(r.snailLayer?.size).toBe(2);
    expect(r.projectileLayer?.size).toBe(1);
    expect(r.terrainMeshes?.meshCount).toBeGreaterThan(0);
    expect(render).toHaveBeenCalled();
    r.pushSnapshot(snap(2, 1, 0));
    for (let i = 0; i < 10; i++) tick(100);
    expect(r.snailLayer?.size).toBe(1);
    expect(r.projectileLayer?.size).toBe(0);
  });

  it('propagates tier shadow flags to existing terrain and snail meshes', () => {
    const { r, tick } = setup();
    r.init({ grid: makeGrid(), waterLevel: 2 });
    r.pushSnapshot(snap(1, 2, 0));
    tick(16);
    tick(16);
    const chunk = (): THREE.Object3D => r.terrainMeshes!.group.children[0]!;
    const body = (): THREE.Object3D => r.snailLayer!.get('s0')!.bodyGroup.children[0]!;
    expect(chunk().castShadow).toBe(true);
    expect(body().castShadow).toBe(true);
    r.setTier('mobile');
    expect(chunk().castShadow).toBe(false);
    expect(chunk().receiveShadow).toBe(false);
    expect(body().castShadow).toBe(false);
    r.setTier('high');
    expect(chunk().castShadow).toBe(true);
    expect(chunk().receiveShadow).toBe(true);
    expect(body().castShadow).toBe(true);
  });

  it('applies carve events to the replica and spawns explosions', () => {
    const { r } = setup();
    const grid = makeGrid();
    r.init({ grid, waterLevel: 2 });
    const at = { x: 8, y: 9, z: 12 };
    const before = r.terrainReplica?.grid.sample(at) as number;
    const events = [
      { type: 'terrainCarved', centre: at, radius: 3, chunks: [] },
      { type: 'explosion', position: at, radius: 3, weaponId: 'w' },
    ] as unknown as SimEvent[];
    r.handleEvents(events);
    expect(r.terrainReplica?.grid.sample(at)).toBeGreaterThan(before);
    expect(grid.sample(at)).toBe(before);
    expect(r.explosionEffects?.activeFlashes).toBe(1);
    expect(r.explosionEffects?.liveParticles).toBeGreaterThan(0);
  });

  it('addLayer attaches before and after init and can be removed', () => {
    const { r, tick } = setup();
    const a = new THREE.Group();
    const upd = vi.fn();
    r.addLayer({ name: 'wind', group: a, updater: upd });
    r.init({ grid: makeGrid(), waterLevel: 2 });
    expect(a.parent).toBe(r.view?.roots.effects);
    tick(16);
    expect(upd).toHaveBeenCalled();
    const b = new THREE.Group();
    const remove = r.addLayer({ name: 'late', group: b });
    expect(b.parent).toBe(r.view?.roots.effects);
    remove();
    expect(b.parent).toBeNull();
  });

  it('re-init and dispose tear down cleanly', () => {
    const { r } = setup();
    r.init({ grid: makeGrid(), waterLevel: 2 });
    const first = r.view;
    r.setTier('mobile');
    r.init({ grid: makeGrid(), waterLevel: 2 });
    expect(r.view).not.toBe(first);
    expect(r.view?.tier).toBe('mobile');
    r.dispose();
    expect(r.view).toBeNull();
  });

  it('has no prop layer without a model URL, and builds one (async) with a mock loader', async () => {
    expect(setup().r.propLayer).toBeNull();
    const loader = new CachedModelLoader(async () => [
      { geometry: new THREE.BoxGeometry(0.2, 0.2, 0.2), material: new THREE.MeshBasicMaterial() },
    ]);
    const { r, tick } = setup({ modelBaseUrl: '/models/', modelLoader: loader });
    r.init({ grid: makeGrid(), waterLevel: 2 });
    r.pushSnapshot(snap(1, 1, 0));
    expect(r.propLayer).not.toBeNull();
    tick(16);
    expect(r.propLayer?.count).toBe(0);
    await new Promise((res) => setTimeout(res, 0));
    tick(16);
    tick(16);
    expect(r.propLayer?.settled).toBe(true);
    expect(r.propLayer?.count).toBeGreaterThan(0);
    expect(r.propLayer?.group.parent).toBe(r.view?.roots.entities);
    r.dispose();
    expect(r.propLayer).toBeNull();
  });
});
