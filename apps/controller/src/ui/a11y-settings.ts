import { HUD, TYPE_TOKENS } from '@snails/render';

/** Phone UI text size choices. */
export type TextSize = 'small' | 'normal' | 'large';

/** Accessibility settings stored on the phone. */
export interface A11ySettings {
  textSize: TextSize;
  /** Force reduced motion even when the OS does not ask for it. */
  reducedMotion: boolean;
}

/** All text size choices, smallest first. */
export const TEXT_SIZES: readonly TextSize[] = ['small', 'normal', 'large'];

/** Type scale multiplier per text size. */
export const TEXT_SCALE: Readonly<Record<TextSize, number>> = {
  small: 0.85,
  normal: 1,
  large: 1.4,
};

/** Defaults used when nothing valid is stored. */
export const DEFAULT_A11Y: A11ySettings = { textSize: 'normal', reducedMotion: false };

/** localStorage key. */
export const A11Y_KEY = 'snails.a11y';

/**
 * Parses stored settings JSON; anything invalid falls back to the defaults field by field.
 * @param raw stored string or null
 */
export function parseA11y(raw: string | null | undefined): A11ySettings {
  if (!raw) return { ...DEFAULT_A11Y };
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return { ...DEFAULT_A11Y };
    const o = v as Record<string, unknown>;
    const size = TEXT_SIZES.find((s) => s === o.textSize);
    return {
      textSize: size ?? DEFAULT_A11Y.textSize,
      reducedMotion: o.reducedMotion === true,
    };
  } catch {
    return { ...DEFAULT_A11Y };
  }
}

/**
 * Loads settings; storage failures yield the defaults.
 * @param storage a Storage or undefined when unavailable
 */
export function loadA11y(storage: Pick<Storage, 'getItem'> | undefined): A11ySettings {
  try {
    return parseA11y(storage?.getItem(A11Y_KEY));
  } catch {
    return { ...DEFAULT_A11Y };
  }
}

/**
 * Persists settings; failures (private mode, quota) are ignored.
 * @param storage a Storage or undefined when unavailable
 * @param s settings to store
 */
export function saveA11y(storage: Pick<Storage, 'setItem'> | undefined, s: A11ySettings): void {
  try {
    storage?.setItem(A11Y_KEY, JSON.stringify(s));
  } catch {
    // Storage is a convenience only.
  }
}

/**
 * Whether motion should be reduced: the toggle or the OS preference.
 * @param s settings
 * @param mediaMatches result of `prefers-reduced-motion: reduce`
 */
export function effectiveReducedMotion(s: A11ySettings, mediaMatches: boolean): boolean {
  return s.reducedMotion || mediaMatches;
}

/**
 * CSS custom properties that scale the theme type scale (`--snl-text-*`) for a text size.
 * @param size chosen text size
 */
export function textScaleVars(size: TextSize): Record<string, string> {
  const k = TEXT_SCALE[size];
  const out: Record<string, string> = {};
  HUD.typeScale.forEach((px, i) => {
    out[TYPE_TOKENS[i] ?? `--snl-text-${i}`] = `${Math.round(px * k * 10) / 10}px`;
  });
  return out;
}

/** Stylesheet that shortens animations when `data-reduced-motion` is set on the root. */
export const REDUCED_MOTION_CSS =
  ':root[data-reduced-motion] *,:root[data-reduced-motion] *::before,:root[data-reduced-motion] *::after' +
  '{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}';

/**
 * Applies settings to the document root (type scale variables and the reduced-motion flag).
 * @param root `document.documentElement`
 * @param s settings
 * @param mediaMatches result of `prefers-reduced-motion: reduce`
 */
export function applyA11y(root: HTMLElement, s: A11ySettings, mediaMatches: boolean): void {
  for (const [k, v] of Object.entries(textScaleVars(s.textSize))) root.style.setProperty(k, v);
  if (effectiveReducedMotion(s, mediaMatches)) root.setAttribute('data-reduced-motion', '');
  else root.removeAttribute('data-reduced-motion');
}
