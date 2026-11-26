import { describe, expect, it } from 'vitest';
import type { WireEvent } from '@snails/protocol';
import { crateToasts } from './crate-toast';

const ev = (teamId: string, text: string): WireEvent =>
  ({
    type: 'crateCollected',
    crateId: 'c1',
    defId: 'base:health-crate',
    snailId: `${teamId}:0`,
    teamId,
    position: { x: 0, y: 0, z: 0 },
    healed: 25,
    damage: 0,
    weapons: [],
    text,
  }) as WireEvent;

describe('crateToasts', () => {
  it('reports only crates collected by my teams', () => {
    expect(crateToasts([ev('a', '+25 HP'), ev('b', '+2 Rope')], ['a'])).toEqual(['Crate: +25 HP']);
    expect(crateToasts([ev('b', 'x')], ['a'])).toEqual([]);
  });
});
