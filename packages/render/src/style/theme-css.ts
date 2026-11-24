import { HUD, PALETTE, hexToRgb } from './palette.js';

/** Font stack for all 2D UI: rounded where the OS has one, no web font downloads. */
export const UI_FONT = '"Nunito", ui-rounded, system-ui, "Segoe UI", Roboto, sans-serif';

/** CSS custom property names for the UI theme (all values derive from the palette constants). */
export const THEME_VARS = {
  ink: '--snl-ink',
  inkRgb: '--snl-ink-rgb',
  paper: '--snl-paper',
  paperRgb: '--snl-paper-rgb',
  accent: '--snl-accent',
  accentRgb: '--snl-accent-rgb',
  foam: '--snl-foam',
  grass: '--snl-grass',
  grassEdge: '--snl-grass-edge',
  water: '--snl-water',
  font: '--snl-font',
  radius: '--snl-radius',
  outline: '--snl-outline',
  shadow: '--snl-shadow',
} as const;

/** Type scale token names, smallest first. Values come from {@link HUD}.typeScale (CSS px). */
export const TYPE_TOKENS = [
  '--snl-text-xs',
  '--snl-text-s',
  '--snl-text-m',
  '--snl-text-l',
  '--snl-text-xl',
  '--snl-text-xxl',
] as const;

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const rgb = (n: number): string => hexToRgb(n).join(',');

/**
 * Returns the `:root` stylesheet for the 2D UI: palette colours, the type scale and shape tokens.
 * Both apps inject it once at start-up so their hand-written CSS only uses `var(--snl-*)`.
 * @returns a single CSS rule
 */
export function themeCss(): string {
  const scale = HUD.typeScale.map((px, i) => `${TYPE_TOKENS[i] ?? `--snl-text-${i}`}:${px}px`);
  const decls = [
    `${THEME_VARS.ink}:${hex(PALETTE.uiInk)}`,
    `${THEME_VARS.inkRgb}:${rgb(PALETTE.uiInk)}`,
    `${THEME_VARS.paper}:${hex(PALETTE.uiPaper)}`,
    `${THEME_VARS.paperRgb}:${rgb(PALETTE.uiPaper)}`,
    `${THEME_VARS.accent}:${hex(PALETTE.uiAccent)}`,
    `${THEME_VARS.accentRgb}:${rgb(PALETTE.uiAccent)}`,
    `${THEME_VARS.foam}:${hex(PALETTE.waterFoam)}`,
    `${THEME_VARS.grass}:${hex(PALETTE.grassTop)}`,
    `${THEME_VARS.grassEdge}:${hex(PALETTE.grassEdge)}`,
    `${THEME_VARS.water}:${hex(PALETTE.waterDeep)}`,
    `${THEME_VARS.font}:${UI_FONT}`,
    `${THEME_VARS.radius}:${HUD.cornerRadius}px`,
    `${THEME_VARS.outline}:${HUD.outlineWidth}px`,
    `${THEME_VARS.shadow}:0 2px 8px rgba(${rgb(PALETTE.uiInk)},.35)`,
    ...scale,
  ];
  return `:root{${decls.join(';')}}`;
}

/**
 * Adds the theme stylesheet to `doc` once (idempotent). Call before any UI is mounted.
 * @param doc the document to style
 */
export function injectTheme(doc: Document): void {
  if (doc.getElementById('snails-theme')) return;
  const style = doc.createElement('style');
  style.id = 'snails-theme';
  style.textContent = themeCss();
  doc.head.append(style);
}
