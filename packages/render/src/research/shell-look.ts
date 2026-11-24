import { PALETTE } from '../style/palette.js';

/** Shell material variants a tech can grant (mirrors `TechVisual.shellMaterial`). */
export type ShellMaterialKind = 'chalky' | 'calcified' | 'iron' | 'crystal';

/** The slice of a tech's `visual` payload the renderer reads. */
export interface TechVisualInput {
  shellMaterial?: ShellMaterialKind | undefined;
  attachments?: readonly string[] | undefined;
  glow?: string | undefined;
}

/** Looks up a tech's visual payload by tech id. */
export type TechVisualLookup = (techId: string) => TechVisualInput | undefined;

/** Persistent look of a team's shells, derived from its researched techs. */
export interface ShellLook {
  /** Latest granted shell material, or null for the plain team shell. */
  material: ShellMaterialKind | null;
  /** Attachment names, in the order researched, without duplicates. */
  attachments: string[];
  /** Glow colour (0xRRGGBB), or null. */
  glow: number | null;
}

/** The plain look (no research). */
export const PLAIN_LOOK: ShellLook = { material: null, attachments: [], glow: null };

/** Parses a CSS hex glow colour (`#rgb` or `#rrggbb`); anything else falls back to the accent. */
export function parseGlow(css: string): number {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css.trim());
  if (!m) return PALETTE.uiAccent;
  const h = m[1] as string;
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return parseInt(full, 16);
}

/**
 * Derives a team's shell look from its completed techs in completion order: the latest
 * `shellMaterial` wins, attachments accumulate, the latest `glow` wins. Unknown ids are skipped.
 */
export function deriveShellLook(
  researched: readonly string[] | undefined,
  lookup: TechVisualLookup,
): ShellLook {
  if (!researched || researched.length === 0) return PLAIN_LOOK;
  const look: ShellLook = { material: null, attachments: [], glow: null };
  for (const id of researched) {
    const v = lookup(id);
    if (!v) continue;
    if (v.shellMaterial) look.material = v.shellMaterial;
    for (const a of v.attachments ?? [])
      if (!look.attachments.includes(a)) look.attachments.push(a);
    if (v.glow) look.glow = parseGlow(v.glow);
  }
  return look;
}

/** Stable string key of a look (cheap change detection). */
export function lookKey(look: ShellLook): string {
  return `${look.material ?? '-'}|${look.attachments.join(',')}|${look.glow ?? '-'}`;
}

/** Research feedback state of one team as the renderer consumes it. */
export interface TeamResearchView {
  /** Public flag: a tech is being researched (drives the shimmer). */
  researching: boolean;
  /** Derived persistent look. */
  look: ShellLook;
}
