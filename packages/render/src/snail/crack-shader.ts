/**
 * GLSL for the procedural shell cracks. Driven by one `uDamage` uniform (0 intact .. 1 destroyed)
 * in shell UV space (vSpiral along the spiral, vAround around the whorl), so every damage level
 * shares one shader program and cracks grow smoothly with the uniform.
 */

/** Fragment declarations: hash, ridge cracks and the layered crack mask. */
export function crackDecl(cheap: boolean): string {
  return /* glsl */ `
uniform float uDamage;
uniform vec3 uFleshColor;
float crackFlesh = 0.0;
float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Thin ridge line where noise crosses 0.5; width is in noise units.
float ridge(vec2 p, float width) {
  float n = vnoise(p);
  float w = max(fwidth(n), 1e-4);
  return 1.0 - smoothstep(width, width + w * 1.5, abs(n - 0.5));
}
vec2 crackUv() {
  // Spiral axis is stretched so cracks run across the whorls.
  vec2 p = vec2(vSpiral * 9.0, vAround * 5.0);
  ${cheap ? '' : 'p += 0.6 * vec2(vnoise(p * 1.7), vnoise(p * 1.7 + 7.1));'}
  return p;
}
// Returns crack darkness 0..1; sets crackFlesh (0..1) for the exposed-flesh emissive.
float crackAmount(float d) {
  vec2 p = crackUv();
  float scuff = smoothstep(0.0, 0.08, d) * (1.0 - smoothstep(0.2, 0.3, d))
    * ridge(p * 3.1, 0.018) * 0.6;
  float nearLip = smoothstep(0.55, 0.9, vSpiral);
  float scratch = smoothstep(0.2, 0.3, d) * nearLip * ridge(p * 2.3 + 3.7, 0.03);
  float deep = smoothstep(0.45, 0.55, d) * ridge(p * 1.4 + 9.2, 0.05)
    * smoothstep(0.1, 0.5, vSpiral);
  ${cheap ? '' : 'scratch += smoothstep(0.2, 0.3, d) * nearLip * ridge(p * 4.7, 0.015) * 0.6;'}
  float blob = vnoise(vec2(vSpiral * 3.0 + 1.3, vAround * 2.0 + 0.7));
  float hole = smoothstep(0.72, 0.5, blob) * smoothstep(0.7, 0.8, d);
  crackFlesh = hole;
  return clamp(max(max(scuff, scratch), max(deep, hole)), 0.0, 1.0);
}
`;
}

/** Fragment snippet applied after the pattern: darkens albedo by the crack mask. */
export const CRACK_COLOR = /* glsl */ `
  float crack = crackAmount(uDamage);
  diffuseColor.rgb *= 1.0 - 0.7 * crack;
  diffuseColor.rgb *= 1.0 - 0.25 * uDamage;
`;

/** Emissive addition: exposed flesh glows through the broken section at critical damage. */
export const CRACK_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += uFleshColor * crackFlesh * 0.8;
`;
