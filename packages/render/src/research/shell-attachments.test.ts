import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_REGISTRY,
  attachmentDef,
  attachmentGeometry,
  decalGeometry,
  decalIndexForTeam,
  decalOutline,
} from './shell-attachments.js';
import { ShellExtras } from './shell-extras.js';
import { TEAM_GLYPHS } from '../style/team-glyphs.js';

describe('shell attachments', () => {
  it('resolves content names and rejects unknown ones', () => {
    expect(attachmentDef('plating-light')?.kind).toBe('plates');
    expect(attachmentDef('rope-coil')?.kind).toBe('rope');
    expect(attachmentDef('antenna')?.kind).toBe('antenna');
    expect(attachmentDef('toString')).toBeUndefined();
    expect(attachmentDef('wings')).toBeUndefined();
    expect(Object.keys(ATTACHMENT_REGISTRY)).toContain('flag');
  });
  it('shares geometry between calls', () => {
    expect(attachmentGeometry('antenna')).toBe(attachmentGeometry('antenna'));
    expect(decalGeometry(3)).toBe(decalGeometry(3));
    expect(attachmentGeometry('flag').getAttribute('position').count).toBeGreaterThan(3);
  });
  it('chooses a distinct decal per team, wrapping like the glyphs', () => {
    const idx = TEAM_GLYPHS.map((_, i) => decalIndexForTeam(i));
    expect(new Set(idx).size).toBe(TEAM_GLYPHS.length);
    expect(decalIndexForTeam(TEAM_GLYPHS.length + 2)).toBe(decalIndexForTeam(2));
    for (let i = 0; i < 8; i++) expect(decalOutline(i).length).toBeGreaterThanOrEqual(3);
  });
  it('places pieces, decal, flag, and culls on low detail', () => {
    const x = new ShellExtras(new THREE.SphereGeometry(0.5, 6, 4));
    x.setLook({
      material: null,
      attachments: ['antenna', 'rope-coil', 'plating-light'],
      glow: null,
    });
    expect(x.pieceCount).toBe(6);
    x.setFlag(true);
    expect(x.pieceCount).toBe(7);
    x.setTeam(2, 0xff0000);
    x.setTeam(2, 0xff0000);
    x.setDetail(false);
    expect(x.detailVisible).toBe(false);
    x.setTeam(null);
    x.dispose();
  });
});
