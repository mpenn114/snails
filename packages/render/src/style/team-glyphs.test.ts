import { describe, expect, it } from 'vitest';
import { TEAM_COLORS, hexToCss } from './palette.js';
import {
  TEAM_GLYPHS,
  teamColourName,
  teamGlyph,
  teamGlyphForColour,
  teamIndexForColour,
  teamMarkerHtml,
} from './team-glyphs.js';

describe('team glyphs', () => {
  it('gives every palette team a distinct glyph', () => {
    expect(new Set(TEAM_GLYPHS).size).toBe(TEAM_COLORS.length);
  });
  it('wraps like the shell pattern', () => {
    expect(teamGlyph(8)).toBe(teamGlyph(0));
    expect(teamGlyph(-1)).toBe(teamGlyph(7));
  });
  it('maps colours to glyphs case-insensitively', () => {
    const css = hexToCss(TEAM_COLORS[2]!);
    expect(teamIndexForColour(css.toUpperCase())).toBe(2);
    expect(teamGlyphForColour(css)).toBe(teamGlyph(2));
    expect(teamColourName(css)).toBe('sunflower');
  });
  it('is empty for unknown colours', () => {
    expect(teamGlyphForColour('#123456')).toBe('');
    expect(teamGlyphForColour(null)).toBe('');
    expect(teamMarkerHtml(undefined)).toBe('');
    expect(teamMarkerHtml(hexToCss(TEAM_COLORS[0]!))).toContain('aria-label="cherry"');
  });
});
