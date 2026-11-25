import type { ShellMaterialKind } from '../research/shell-look.js';

/** Seconds a material change takes to sweep the shell from apex outward. */
export const TIER_TRANSITION_S = 0.8;

/** Tier id of the plain team shell (no research material). */
export const TIER_PLAIN = -1;

const TIER_OF: Record<ShellMaterialKind, number> = { chalky: 0, calcified: 1, iron: 2, crystal: 3 };

/** Shader tier id of a research material (0 chalky .. 3 crystal; {@link TIER_PLAIN} for none). */
export function tierOfKind(kind: ShellMaterialKind | null | undefined): number {
  return kind ? TIER_OF[kind] : TIER_PLAIN;
}

/** Live tier uniforms of a shell material (written each frame, no recompile). */
export interface TierUniforms {
  /** Tier being dissolved out. */
  from: { value: number };
  /** Tier being revealed (the current tier once progress is 1). */
  to: { value: number };
  /** Sweep progress 0..1 (1 = transition finished). */
  progress: { value: number };
}

/** Fresh uniforms settled on `tier`. */
export function makeTierUniforms(tier: number): TierUniforms {
  return { from: { value: tier }, to: { value: tier }, progress: { value: 1 } };
}

/**
 * Starts a transition to `tier`: the previous target becomes the old look (a running sweep is
 * cut short and restarts from the apex). A no-op when `tier` is already the target.
 */
export function beginTierTransition(u: TierUniforms, tier: number): void {
  if (u.to.value === tier) return;
  u.from.value = u.to.value;
  u.to.value = tier;
  u.progress.value = 0;
}

/** Advances the sweep by `dt` seconds; returns true while it is still running. */
export function advanceTierTransition(u: TierUniforms, dt: number): boolean {
  if (u.progress.value >= 1) return false;
  u.progress.value = Math.min(1, u.progress.value + Math.max(0, dt) / TIER_TRANSITION_S);
  return u.progress.value < 1;
}

/** GLSL of the apex-outward dissolve between two tier looks. */
const TIER_SWEEP = /* glsl */ `
// Sweeps apex outward: spirals below the front show the new tier, with a bright dissolve edge.
vec3 tierApply(vec3 col, vec2 su) {
  vec3 gTo;
  vec3 res = tierSurface(uTierTo, col, su, gTo);
  tierGlow = gTo;
  if (uTierProg >= 1.0) return res;
  vec3 gFrom;
  vec3 old = tierSurface(uTierFrom, col, su, gFrom);
  float front = uTierProg * 1.15;
  float k = smoothstep(front, front - 0.08, su.x + 0.02 * vnoise(su * 30.0));
  float band = k * (1.0 - smoothstep(0.0, 0.1, front - su.x));
  tierGlow = mix(gFrom, gTo, k) + vec3(0.9, 0.85, 0.6) * band * 0.5;
  return mix(old, res, k) + vec3(1.0, 0.95, 0.75) * band * 0.25;
}
`;

/** GLSL for the per-tier surface detail; needs `vnoise`/`h21` from the crack shader. */
export function tierDecl(cheap: boolean): string {
  const crystal = cheap
    ? 'glow = vec3(0.1, 0.35, 0.4) * 0.35;'
    : `vec2 cell = floor(vec2(s * 12.0, a * 6.0));
  float f = h21(cell);
  col *= 0.88 + 0.24 * f;
  glow = vec3(0.25, 0.72, 0.78) * (0.25 + 0.45 * f);`;
  return /* glsl */ `
uniform float uTierFrom;
uniform float uTierTo;
uniform float uTierProg;
vec3 tierGlow = vec3(0.0);
float tierRing(vec2 c, float r) { return 1.0 - smoothstep(r - 0.06, r + 0.06, length(c)); }
// One tier's tint + procedural detail. Tint is partial and detail is light shading, so the team
// pattern (already mixed in) stays readable.
vec3 tierSurface(float t, vec3 col, vec2 su, out vec3 glow) {
  glow = vec3(0.0);
  float s = su.x;
  float a = su.y;
  if (t < -0.5) return col;
  if (t < 0.5) {
    col = mix(col, vec3(0.945, 0.918, 0.847), 0.3);
    col *= 1.0 - 0.09 * smoothstep(0.1, 0.0, abs(fract(s * 34.0) - 0.5) - 0.4);
    float thin = smoothstep(0.55, 1.0, abs(fract(a) - 0.5) * 2.0);
    return mix(col, vec3(0.97, 0.95, 0.9), 0.35 * thin);
  }
  if (t < 1.5) {
    col = mix(col, vec3(0.89, 0.83, 0.66), 0.4);
    float rid = sin(s * 150.0) * 0.5 + 0.5;
    col *= 0.9 + 0.14 * rid;
    float pearl = vnoise(vec2(s * 6.0, a * 5.0));
    col += vec3(0.07, 0.05, 0.08) * pearl + 0.06 * smoothstep(0.7, 1.0, rid);
    return col;
  }
  if (t < 2.5) {
    col = mix(col, vec3(0.42, 0.44, 0.48), 0.5) * 0.85;
    vec2 c = vec2(fract(s * 16.0) - 0.5, fract(a * 6.0) - 0.5);
    float stud = tierRing(c, 0.2);
    col = mix(col, vec3(0.65, 0.68, 0.74), stud * 0.7);
    col *= 1.0 - 0.35 * (tierRing(c, 0.3) - stud);
    return col;
  }
  col = mix(col, vec3(0.62, 0.9, 0.93), 0.3);
  ${crystal}
  return col;
}
${TIER_SWEEP}
`;
}

/** Fragment snippet: applies the tier look after pattern and lip. */
export const TIER_COLOR = /* glsl */ `
  diffuseColor.rgb = tierApply(diffuseColor.rgb, vec2(vSpiral, vAround));
`;

/** Emissive addition for crystal glow and the dissolve edge. */
export const TIER_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += tierGlow;
`;
