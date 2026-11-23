import { describe, expect, it } from 'vitest';
import { HUD, PALETTE } from './palette.js';
import { THEME_VARS, TYPE_TOKENS, themeCss } from './theme-css.js';

describe('themeCss', () => {
  const css = themeCss();

  it('maps palette UI colours to :root variables', () => {
    expect(css).toContain(`${THEME_VARS.ink}:#2b2438`);
    expect(css).toContain(`${THEME_VARS.paper}:#fff6e4`);
    expect(css).toContain(`${THEME_VARS.accent}:#ff8a3d`);
    expect(css).toContain(`${THEME_VARS.accentRgb}:255,138,61`);
    expect(PALETTE.uiAccent).toBe(0xff8a3d);
  });

  it('emits one type token per HUD type-scale step', () => {
    expect(TYPE_TOKENS).toHaveLength(HUD.typeScale.length);
    HUD.typeScale.forEach((px, i) => expect(css).toContain(`${TYPE_TOKENS[i]}:${px}px`));
  });

  it('is a single :root rule with the radius token', () => {
    expect(css.startsWith(':root{')).toBe(true);
    expect(css).toContain(`${THEME_VARS.radius}:${HUD.cornerRadius}px`);
  });
});
