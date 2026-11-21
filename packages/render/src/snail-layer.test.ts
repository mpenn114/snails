import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  LABEL_MAX_SCALE,
  LABEL_MIN_SCALE,
  SnailLayer,
  labelScaleForDistance,
} from './snail-layer.js';
import { paletteColour, resolveTeamColour, type SnailView } from './snail-view.js';

const view = (id: string, over: Partial<SnailView> = {}): SnailView => ({
  id,
  teamId: 't0',
  colour: 0xff0000,
  position: { x: 1, y: 2, z: 3 },
  facing: 0,
  health: 50,
  maxHealth: 100,
  alive: true,
  name: id,
  isActive: false,
  ...over,
});

const makeLayer = (): { layer: SnailLayer; made: THREE.Texture[] } => {
  const made: THREE.Texture[] = [];
  const layer = new SnailLayer({
    labelFactory: () => {
      const t = new THREE.Texture();
      made.push(t);
      return t;
    },
  });
  return { layer, made };
};

describe('SnailLayer', () => {
  it('creates, updates and removes by id', () => {
    const { layer } = makeLayer();
    layer.sync([view('a'), view('b')]);
    expect(layer.size).toBe(2);
    expect(layer.group.children).toHaveLength(2);
    const a = layer.get('a');
    layer.sync([view('a', { position: { x: 9, y: 8, z: 7 } })]);
    expect(layer.get('a')).toBe(a);
    expect(a?.group.position.toArray()).toEqual([9, 8, 7]);
    expect(layer.get('b')).toBeUndefined();
    expect(layer.group.children).toHaveLength(1);
  });

  it('tints per team colour and applies facing', () => {
    const { layer } = makeLayer();
    layer.sync([
      view('a', { colour: 0x00ff00, facing: Math.PI / 2 }),
      view('b', { colour: 0x0000ff }),
    ]);
    expect(layer.get('a')?.colour).toBe(0x00ff00);
    expect(layer.get('b')?.colour).toBe(0x0000ff);
    expect(layer.get('a')?.bodyGroup.rotation.y).toBeCloseTo(Math.PI / 2);
  });

  it('scales the health bar and shows highlight for active snail', () => {
    const { layer } = makeLayer();
    layer.sync([view('a', { health: 25, isActive: true })]);
    const m = layer.get('a');
    expect(m?.healthFraction).toBeCloseTo(0.25);
    expect(m?.highlight.visible).toBe(true);
    layer.sync([view('a', { health: 500 })]);
    expect(m?.healthFraction).toBe(1);
    expect(m?.highlight.visible).toBe(false);
  });

  it('hides body and ui when dead and shows a grave', () => {
    const { layer } = makeLayer();
    layer.sync([view('a', { alive: false, health: 0 })]);
    const m = layer.get('a');
    expect(m?.bodyGroup.visible).toBe(false);
    expect(m?.nameTag.visible).toBe(false);
    expect(m?.barGroup.visible).toBe(false);
    expect(m?.grave.visible).toBe(true);
  });

  it('only recreates the label texture when the name changes', () => {
    const { layer, made } = makeLayer();
    layer.sync([view('a')]);
    layer.sync([view('a')]);
    expect(made).toHaveLength(1);
    layer.sync([view('a', { name: 'zed' })]);
    expect(made).toHaveLength(2);
  });

  it('updater syncs from state and ignores null', () => {
    const selectViews = vi.fn(() => [view('x')]);
    const l = new SnailLayer({ labelFactory: () => new THREE.Texture(), selectViews });
    l.updater(0.016, null);
    expect(l.size).toBe(0);
    l.updater(0.016, { snapshot: {} as never, alpha: 0 });
    expect(l.size).toBe(1);
    l.dispose();
  });

  it('billboards bars toward the camera', () => {
    const { layer } = makeLayer();
    const cam = new THREE.PerspectiveCamera();
    cam.quaternion.setFromEuler(new THREE.Euler(0, 1, 0));
    layer.setCamera(cam);
    layer.sync([view('a')]);
    expect(layer.get('a')?.barGroup.quaternion.equals(cam.quaternion)).toBe(true);
  });

  it('disposes meshes, shared assets and textures', () => {
    const { layer, made } = makeLayer();
    layer.sync([view('a'), view('b')]);
    const spy = vi.spyOn(made[0] as THREE.Texture, 'dispose');
    const root = new THREE.Group();
    root.add(layer.group);
    layer.dispose();
    expect(spy).toHaveBeenCalled();
    expect(layer.size).toBe(0);
    expect(root.children).toHaveLength(0);
  });
});

describe('team colours', () => {
  it('parses CSS colours and falls back to the palette', () => {
    expect(resolveTeamColour('#ff0000', 3)).toBe(0xff0000);
    expect(resolveTeamColour(undefined, 1)).toBe(paletteColour(1));
    expect(paletteColour(8)).toBe(paletteColour(0));
    expect(paletteColour(0)).not.toBe(paletteColour(1));
  });
});

describe('label scaling', () => {
  it('keeps base size up close, grows with distance and caps', () => {
    expect(labelScaleForDistance(0.1)).toBe(LABEL_MIN_SCALE);
    expect(labelScaleForDistance(12)).toBeCloseTo(1);
    expect(labelScaleForDistance(24)).toBeCloseTo(2);
    expect(labelScaleForDistance(1e6)).toBe(LABEL_MAX_SCALE);
  });
  it('scales tag and bar of far snails', () => {
    const { layer } = makeLayer();
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(1, 2, 87);
    layer.setCamera(cam);
    layer.sync([view('a')]);
    expect(layer.get('a')?.barGroup.scale.x).toBeCloseTo(7);
  });

  it.each([true, false])('sets snail body castShadow to %s, never on labels or bars', (on) => {
    const layer = new SnailLayer({
      labelFactory: () => new THREE.Texture(),
      shadows: on,
    });
    layer.sync([view('a')]);
    const mesh = layer.group.children[0]!;
    const cast: boolean[] = [];
    mesh.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) cast.push(o.castShadow);
    });
    expect(cast.filter(Boolean)).toHaveLength(on ? 2 : 0);
  });
});
