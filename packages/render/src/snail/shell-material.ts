import * as THREE from 'three';
import type { QualityTier } from '../quality.js';
import { createToonMaterial } from '../style/materials.js';
import type { ShellMaterialKind } from '../research/shell-look.js';
import { CRACK_COLOR, CRACK_EMISSIVE, crackDecl } from './crack-shader.js';
import {
  TIER_COLOR,
  TIER_EMISSIVE,
  makeTierUniforms,
  tierDecl,
  tierOfKind,
  type TierUniforms,
} from './shell-tier.js';
import {
  LIP_START,
  APEX_CLEAR,
  SUTURE_AROUND,
  lipColour,
  patternTint,
  shellPatternForTeam,
} from './shell-pattern.js';

const VERTEX_DECL = /* glsl */ `
attribute float aSpiral;
attribute float aAround;
varying float vSpiral;
varying float vAround;
`;

const FRAGMENT_DECL = /* glsl */ `
uniform float uPattern;
uniform vec3 uPatternColor;
uniform vec3 uLipColor;
varying float vSpiral;
varying float vAround;

float edge(float v, float e) {
  float w = max(fwidth(v), 1e-4) * 0.8;
  return smoothstep(e - w, e + w, v);
}
float stripe(float v, float width) {
  float f = fract(v);
  float w = max(fwidth(v), 1e-4) * 0.8;
  return smoothstep(width + w, width - w, f) * smoothstep(0.0, w, f);
}
float shellMask(float id, float s, float a) {
  float clear = smoothstep(${APEX_CLEAR.toFixed(2)}, ${(APEX_CLEAR + 0.05).toFixed(2)}, s);
  if (id < 0.5) return stripe(s * 20.0, 0.3) * clear;
  if (id < 1.5) return stripe(a * 4.0 + 0.1, 0.3);
  if (id < 2.5) {
    float row = floor(a * 4.0);
    vec2 c = vec2(fract(s * 30.0 + mod(row, 2.0) * 0.5) - 0.5, fract(a * 4.0) - 0.5);
    return 1.0 - smoothstep(0.29, 0.35, length(c));
  }
  if (id < 3.5) {
    float w = max(fwidth(a), 1e-4);
    return max(1.0 - smoothstep(0.045 - w, 0.045 + w, abs(a - 0.17)),
               1.0 - smoothstep(0.045 - w, 0.045 + w, abs(a - 0.83)));
  }
  if (id < 4.5) return stripe(s * 26.0 + abs(fract(a * 3.0) - 0.5) * 1.4, 0.4) * clear;
  if (id < 5.5) return (1.0 - mod(floor(s * 28.0) + floor(a * 4.0), 2.0)) * clear;
  if (id < 6.5) return 1.0 - edge(s, 0.3);
  return stripe(s * 22.0 + a * 2.0, 0.4) * clear;
}
float sutureW(float a) {
  float d = min(abs(a - ${SUTURE_AROUND.toFixed(2)}), abs(a - ${(1 - SUTURE_AROUND).toFixed(2)}));
  return 1.0 - smoothstep(0.0, 0.07, d);
}
`;

const FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
{
  float m = shellMask(uPattern, vSpiral, vAround);
  diffuseColor.rgb = mix(diffuseColor.rgb, uPatternColor, m);
  // Subtle growth lines, darker sutures between whorls, pale lip, dark mouth interior.
  diffuseColor.rgb *= 1.0 - 0.06 * stripe(vSpiral * 90.0, 0.12);
  diffuseColor.rgb *= 1.0 - 0.38 * sutureW(vAround) * smoothstep(0.02, 0.1, vSpiral);
  float lip = smoothstep(${LIP_START.toFixed(3)}, ${(LIP_START + 0.012).toFixed(3)}, vSpiral);
  diffuseColor.rgb = mix(diffuseColor.rgb, uLipColor, lip);
  diffuseColor.rgb *= 1.0 - 0.65 * smoothstep(0.997, 1.0, vSpiral);
  ${TIER_COLOR}
  ${CRACK_COLOR}
}
`;

/** Gentle satin highlight from the first directional light (soft, toon-stepped). */
const SATIN = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
{
  vec3 satinH = normalize(directionalLights[0].direction + normalize(vViewPosition));
  float satin = smoothstep(0.82, 0.9, dot(normalize(normal), satinH));
  totalEmissiveRadiance += vec3(0.1) * satin;
}
#endif
`;

/** Exposed-flesh emissive tint under the broken section at critical damage. */
const FLESH_COLOR = 0xd9534f;

/** Shell materials expose their live damage uniform here (`material.userData`). */
export interface ShellMaterialData {
  /** Displayed damage 0..1; write `.value` each frame, no recompile needed. */
  damageUniform: { value: number };
  /** Tier / dissolve uniforms (see shell-tier). */
  tier: TierUniforms;
}

/** The tier uniforms of a material made by {@link createShellMaterial}. */
export function shellTierUniforms(m: THREE.Material): TierUniforms {
  return (m.userData as ShellMaterialData).tier;
}

/** The damage uniform of a material made by {@link createShellMaterial}. */
export function shellDamageUniform(m: THREE.Material): { value: number } {
  return (m.userData as ShellMaterialData).damageUniform;
}

/** Tint, blend amount and emissive of each research shell material (palette-derived). */
export const MATERIAL_LOOKS: Record<
  ShellMaterialKind,
  { tint: number; mix: number; emissive: number; emissiveIntensity: number }
> = {
  chalky: { tint: 0xf1ead8, mix: 0.45, emissive: 0x000000, emissiveIntensity: 0 },
  calcified: { tint: 0xe3d3a8, mix: 0.6, emissive: 0x000000, emissiveIntensity: 0 },
  iron: { tint: 0x6a6f78, mix: 0.6, emissive: 0x000000, emissiveIntensity: 0 },
  crystal: { tint: 0x9fe6ee, mix: 0.55, emissive: 0x3fb8c8, emissiveIntensity: 0.35 },
};

/** Options of {@link createShellMaterial}. */
export interface ShellMaterialOptions {
  /** Team colour (24-bit hex). */
  colour: number;
  /** Pattern id (see SHELL_PATTERNS); wrapped into range. */
  pattern: number;
  /** Initial displayed damage 0..1 (cracks; changed later through the damage uniform). */
  damage?: number;
  /** Research material variant (absent = plain team shell). */
  kind?: ShellMaterialKind | null;
  /** Quality tier (default high). */
  tier?: QualityTier;
}

/** Cache key identifying a shell material, so snails of equal look share one instance. */
export function shellMaterialKey(o: ShellMaterialOptions): string {
  return [o.colour, shellPatternForTeam(o.pattern), o.kind ?? '-', o.tier ?? 'high'].join('|');
}

/**
 * Toon shell material: team colour with a procedural pattern (in the lighter or darker tint of
 * the team colour, sampled from the `aSpiral` / `aAround` vertex attributes) and a pale lip at
 * the aperture. The shader is shared by all shell materials; only uniforms differ.
 */
export function createShellMaterial(o: ShellMaterialOptions): THREE.MeshToonMaterial {
  const base = new THREE.Color(o.colour);
  const damageUniform = { value: o.damage ?? 0 };
  // Phones (`mobile`) and Low share the cheap shader: no noise warp, no hairlines, no facets.
  const cheap = o.tier === 'low' || o.tier === 'mobile';
  const pattern = shellPatternForTeam(o.pattern);
  const material = createToonMaterial({
    color: o.colour,
    rim: 0.3,
    ...(o.tier ? { tier: o.tier } : {}),
  });
  const tier = makeTierUniforms(tierOfKind(o.kind));
  material.userData = { damageUniform, tier } satisfies ShellMaterialData;
  const patternColor = patternTint(base);
  const lipColor = lipColour(base);
  const rimPatch = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    rimPatch(shader, renderer);
    shader.uniforms.uPattern = { value: pattern };
    shader.uniforms.uPatternColor = { value: patternColor };
    shader.uniforms.uLipColor = { value: lipColor };
    shader.uniforms.uDamage = damageUniform;
    shader.uniforms.uTierFrom = tier.from;
    shader.uniforms.uTierTo = tier.to;
    shader.uniforms.uTierProg = tier.progress;
    shader.uniforms.uFleshColor = { value: new THREE.Color(FLESH_COLOR) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_DECL}`)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSpiral = aSpiral;\nvAround = aAround;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${FRAGMENT_DECL}${crackDecl(cheap)}${tierDecl(cheap)}`,
      )
      .replace('#include <color_fragment>', FRAGMENT_COLOR)
      .replace(
        '#include <emissivemap_fragment>',
        CRACK_EMISSIVE + TIER_EMISSIVE + (cheap ? '' : SATIN),
      );
  };
  const rimKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `shell-${cheap ? 'lo' : 'hi'}-${rimKey()}`;
  return material;
}
