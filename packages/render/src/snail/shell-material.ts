import * as THREE from 'three';
import type { QualityTier } from '../quality.js';
import { createToonMaterial } from '../style/materials.js';
import { LIP_START, lipColour, patternTint, shellPatternForTeam } from './shell-pattern.js';

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
float faceWeight(float a) {
  float c = cos(a * 6.2831853);
  return smoothstep(0.0, 1.0, clamp((0.75 - c) / 0.4, 0.0, 1.0));
}
float shellMask(float id, float s, float a) {
  float f = faceWeight(a);
  if (id < 0.5) return stripe(s * 16.0, 0.4) * f;
  if (id < 1.5) return stripe(a * 3.0 + 0.12, 0.34);
  if (id < 2.5) {
    float row = floor(a * 4.0);
    vec2 c = vec2(fract(s * 12.0 + mod(row, 2.0) * 0.5) - 0.5, fract(a * 4.0) - 0.5);
    return 1.0 - smoothstep(0.27, 0.33, length(vec2(c.x * 1.4, c.y)));
  }
  if (id < 3.5) return stripe(s * 4.5, 0.5) * f;
  if (id < 4.5) return stripe(s * 12.0 + abs(fract(a * 3.0) - 0.5) * 1.6, 0.45) * f;
  if (id < 5.5) {
    float c = mod(floor(s * 12.0) + floor(a * 4.0), 2.0);
    return (1.0 - c) * f;
  }
  if (id < 6.5) return 1.0 - edge(s, 0.34);
  return stripe(s * 10.0 + a * 2.0, 0.42) * f;
}
`;

const FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
{
  float m = shellMask(uPattern, vSpiral, vAround);
  diffuseColor.rgb = mix(diffuseColor.rgb, uPatternColor, m);
  float lip = edge(vSpiral, ${LIP_START.toFixed(3)});
  diffuseColor.rgb = mix(diffuseColor.rgb, uLipColor, lip);
}
`;

/** Quantised damage step (0..DAMAGE_STEPS) used to share darkened materials between snails. */
export const DAMAGE_STEPS = 4;

/** Options of {@link createShellMaterial}. */
export interface ShellMaterialOptions {
  /** Team colour (24-bit hex). */
  colour: number;
  /** Pattern id (see SHELL_PATTERNS); wrapped into range. */
  pattern: number;
  /** Damage step 0..{@link DAMAGE_STEPS}; darkens the shell. */
  damageStep?: number;
  /** Quality tier (default high). */
  tier?: QualityTier;
}

/** Cache key identifying a shell material, so snails of equal look share one instance. */
export function shellMaterialKey(o: ShellMaterialOptions): string {
  return [o.colour, shellPatternForTeam(o.pattern), o.damageStep ?? 0, o.tier ?? 'high'].join('|');
}

/**
 * Toon shell material: team colour with a procedural pattern (in the lighter or darker tint of
 * the team colour, sampled from the `aSpiral` / `aAround` vertex attributes) and a pale lip at
 * the aperture. The shader is shared by all shell materials; only uniforms differ.
 */
export function createShellMaterial(o: ShellMaterialOptions): THREE.MeshToonMaterial {
  const base = new THREE.Color(o.colour);
  const dim = 1 - 0.5 * ((o.damageStep ?? 0) / DAMAGE_STEPS);
  const pattern = shellPatternForTeam(o.pattern);
  const material = createToonMaterial({
    color: o.colour,
    flat: true,
    rim: 0.3,
    ...(o.tier ? { tier: o.tier } : {}),
  });
  material.color.multiplyScalar(dim);
  const patternColor = patternTint(base).multiplyScalar(dim);
  const lipColor = lipColour(base).multiplyScalar(0.5 + 0.5 * dim);
  const rimPatch = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    rimPatch(shader, renderer);
    shader.uniforms.uPattern = { value: pattern };
    shader.uniforms.uPatternColor = { value: patternColor };
    shader.uniforms.uLipColor = { value: lipColor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_DECL}`)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSpiral = aSpiral;\nvAround = aAround;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_DECL}`)
      .replace('#include <color_fragment>', FRAGMENT_COLOR);
  };
  const rimKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `shell-${rimKey()}`;
  return material;
}
