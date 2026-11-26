import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Crate } from '@snails/core';
import { CrateLayer, crateBandColour } from './crate-layer.js';

const crate = (id: string, y: number, grounded: boolean): Crate => ({
  id,
  defId: 'base:health-crate',
  position: { x: 2, y, z: 3 },
  velocity: { x: 0, y: grounded ? 0 : -2, z: 0 },
  grounded,
});

describe('CrateLayer', () => {
  it('creates, moves and removes crate views by id', () => {
    const layer = new CrateLayer(() => new THREE.Texture());
    layer.sync([crate('c1', 10, false), crate('c2', 3, true)]);
    expect(layer.size).toBe(2);
    layer.sync([crate('c1', 9, false)]);
    expect(layer.size).toBe(1);
    layer.dispose();
  });

  it('shows the leaf parachute only while falling', () => {
    const layer = new CrateLayer(() => new THREE.Texture());
    layer.sync([crate('c1', 10, false)]);
    layer.sync([crate('c1', 3, true)]);
    const crateGroup = layer.group.getObjectByName('crate');
    const chute = crateGroup?.children[2];
    expect(chute?.visible).toBe(false);
    layer.sync([crate('c1', 3, false)]);
    expect(chute?.visible).toBe(true);
    layer.dispose();
  });

  it('plays a pooled pop for pickups and destruction, then frees the slot', () => {
    const layer = new CrateLayer(() => new THREE.Texture());
    const at = { x: 1, y: 2, z: 3 };
    layer.handleEvents([
      {
        type: 'crateCollected',
        crateId: 'c1',
        defId: 'base:health-crate',
        snailId: 's',
        teamId: 't',
        position: at,
        healed: 25,
        damage: 0,
        weapons: [],
        text: '+25 HP',
      },
      { type: 'crateDestroyed', crateId: 'c2', position: at, reason: 'explosion' },
    ]);
    expect(layer.activePops).toBe(2);
    layer.updater(1, null);
    expect(layer.activePops).toBe(0);
    layer.dispose();
  });

  it('picks band colours by kind word', () => {
    expect(crateBandColour('base:health-crate')).not.toBe(crateBandColour('base:mystery-crate'));
    expect(crateBandColour('mod:odd')).toBe(crateBandColour('base:supply-crate'));
  });

  it('floats the pickup text up and removes it again', () => {
    const layer = new CrateLayer(() => new THREE.Texture());
    layer.handleEvents([
      {
        type: 'crateCollected',
        crateId: 'c1',
        defId: 'base:health-crate',
        snailId: 'a:0',
        teamId: 'a',
        position: { x: 1, y: 2, z: 3 },
        healed: 25,
        damage: 0,
        weapons: [],
        text: '+25 HP',
      },
    ]);
    expect(layer.activeFloats).toBe(1);
    const y0 = layer.group.children.find((c) => c instanceof THREE.Sprite)?.position.y ?? 0;
    layer.updater(1, undefined as never);
    const y1 = layer.group.children.find((c) => c instanceof THREE.Sprite)?.position.y ?? 0;
    expect(y1).toBeGreaterThan(y0);
    layer.updater(5, undefined as never);
    expect(layer.activeFloats).toBe(0);
    layer.dispose();
  });
});
