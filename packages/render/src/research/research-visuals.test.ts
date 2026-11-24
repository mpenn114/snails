import { describe, expect, it } from 'vitest';
import { ResearchVisuals } from './research-visuals.js';
import { deriveShellLook, parseGlow, type TechVisualInput } from './shell-look.js';

const defs: Record<string, TechVisualInput> = {
  a: { shellMaterial: 'chalky', attachments: ['plates'] },
  b: { shellMaterial: 'iron', attachments: ['spikes', 'plates'], glow: '#ff0000' },
  c: { attachments: ['spikes'] },
};
const lookup = (id: string): TechVisualInput | undefined => defs[id];

describe('deriveShellLook', () => {
  it('is plain without research', () => {
    expect(deriveShellLook(undefined, lookup)).toEqual({
      material: null,
      attachments: [],
      glow: null,
    });
  });
  it('latest material wins, attachments accumulate without duplicates, glow parses', () => {
    const look = deriveShellLook(['a', 'zzz', 'b', 'c'], lookup);
    expect(look.material).toBe('iron');
    expect(look.attachments).toEqual(['plates', 'spikes']);
    expect(look.glow).toBe(0xff0000);
  });
  it('parses short hex and falls back for junk', () => {
    expect(parseGlow('#0f0')).toBe(0x00ff00);
    expect(parseGlow('gold')).toBe(0xff8a3d);
  });
});

describe('ResearchVisuals', () => {
  it('derives looks and the shimmer flag from a snapshot (late join, no events)', () => {
    const r = new ResearchVisuals();
    r.setLookup(lookup);
    r.setTeams([{ id: 't1', researching: true, researched: ['a'] }, { id: 't2' }]);
    expect(r.get('t1').researching).toBe(true);
    expect(r.get('t1').look.material).toBe('chalky');
    expect(r.get('t2').look.attachments).toEqual([]);
    expect(r.get('nope').researching).toBe(false);
  });
  it('reuses the look while researched is unchanged and drops departed teams', () => {
    const r = new ResearchVisuals();
    r.setLookup(lookup);
    r.setTeams([{ id: 't1', researched: ['a'] }]);
    const first = r.get('t1').look;
    r.setTeams([{ id: 't1', researched: ['a'], researching: true }]);
    expect(r.get('t1').look).toBe(first);
    r.setTeams(undefined);
    expect(r.get('t1').look.material).toBeNull();
  });
});
