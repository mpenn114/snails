import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TEAM_COLORS } from '../style/palette.js';
import { createShellMaterial, shellMaterialKey } from './shell-material.js';
import {
  SHELL_PATTERNS,
  lipColour,
  patternCoverage,
  patternMask,
  patternTint,
  shellPatternForTeam,
} from './shell-pattern.js';

describe('shell patterns', () => {
  it('assigns a distinct pattern to each of the 8 team slots', () => {
    const ids = TEAM_COLORS.map((_, i) => shellPatternForTeam(i));
    expect(new Set(ids).size).toBe(TEAM_COLORS.length);
    expect(shellPatternForTeam(8)).toBe(0);
    expect(shellPatternForTeam(-1)).toBe(7);
  });

  it('masks are binary, partial in coverage and differ between patterns', () => {
    const sig = new Set<string>();
    for (let p = 0; p < SHELL_PATTERNS.length; p++) {
      const c = patternCoverage(p);
      expect(c).toBeGreaterThan(0.15);
      expect(c).toBeLessThan(0.7);
      let s = '';
      for (let i = 0; i < 40; i++) s += patternMask(p, i / 40 + 0.01, (i * 7) / 40 + 0.02);
      sig.add(s);
    }
    expect(sig.size).toBe(SHELL_PATTERNS.length);
  });

  it('tints lighter for dark colours and darker for light ones', () => {
    const lum = (c: THREE.Color): number => c.r + c.g + c.b;
    const dark = new THREE.Color(TEAM_COLORS[1]);
    const pale = new THREE.Color(TEAM_COLORS[7]);
    expect(lum(patternTint(dark))).toBeGreaterThan(lum(dark));
    expect(lum(patternTint(pale))).toBeLessThan(lum(pale));
    expect(lipColour(dark).getHex()).not.toBe(dark.getHex());
  });

  it('keys materials by colour, pattern and damage', () => {
    const k = (colour: number, pattern: number, damageStep = 0): string =>
      shellMaterialKey({ colour, pattern, damageStep });
    expect(k(1, 0)).toBe(k(1, 8));
    expect(k(1, 0)).not.toBe(k(1, 1));
    expect(k(1, 0)).not.toBe(k(2, 0));
    expect(k(1, 0)).not.toBe(k(1, 0, 2));
    const m = createShellMaterial({ colour: 0xff0000, pattern: 2, damageStep: 4 });
    expect(m.color.r).toBeLessThan(1);
    m.dispose();
  });
});
