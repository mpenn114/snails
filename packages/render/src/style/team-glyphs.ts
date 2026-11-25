import { TEAM_COLORS, TEAM_COLOR_NAMES, hexToCss } from './palette.js';
import { shellPatternForTeam } from '../snail/shell-pattern.js';

/**
 * One distinct shape glyph per team slot, indexed like {@link TEAM_COLORS} and the shell pattern
 * ({@link shellPatternForTeam}). It is the second, non-colour channel for team identity.
 */
export const TEAM_GLYPHS: readonly string[] = [
  '▲', // triangle
  '■', // square
  '◆', // diamond
  '★', // star
  '✚', // plus
  '⬢', // hexagon
  '▼', // down triangle
  '✖', // cross
];

/**
 * Glyph for a team slot; wraps like the shell pattern so glyph and pattern always agree.
 * @param teamIndex team slot index (palette order)
 */
export function teamGlyph(teamIndex: number): string {
  return TEAM_GLYPHS[shellPatternForTeam(teamIndex) % TEAM_GLYPHS.length]!;
}

/**
 * Team slot for a CSS hex colour, or -1 when it is not one of the team palette colours.
 * @param css colour such as `#e5283f` (case-insensitive)
 */
export function teamIndexForColour(css: string | null | undefined): number {
  if (!css) return -1;
  const c = css.toLowerCase();
  return TEAM_COLORS.findIndex((hex) => hexToCss(hex).toLowerCase() === c);
}

/**
 * Glyph for a team colour; empty for colours outside the palette.
 * @param css CSS hex colour
 */
export function teamGlyphForColour(css: string | null | undefined): string {
  const i = teamIndexForColour(css);
  return i < 0 ? '' : teamGlyph(i);
}

/**
 * Accessible name for a team colour ("cherry"), or empty when it is not a palette colour.
 * @param css CSS hex colour
 */
export function teamColourName(css: string | null | undefined): string {
  const i = teamIndexForColour(css);
  return i < 0 ? '' : (TEAM_COLOR_NAMES[i] ?? '');
}

/**
 * Inline marker HTML: the glyph with a screen reader label (empty if the colour is unknown).
 * @param css CSS hex colour
 */
export function teamMarkerHtml(css: string | null | undefined): string {
  const g = teamGlyphForColour(css);
  if (!g) return '';
  return `<span class="team-glyph" role="img" aria-label="${teamColourName(css)}">${g}</span>`;
}
