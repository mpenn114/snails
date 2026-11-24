/** GLSL for the stylised water (toon foam bands, depth gradient, gentle waves). */

/** Vertex shader: gentle layered sine waves (only compiled in with `WAVES`). */
export const WATER_VERT = /* glsl */ `
#include <fog_pars_vertex>
uniform float uTime;
uniform float uWaveAmp;
varying vec3 vWorld;
float waveHeight(vec2 p, float t) {
  return (sin(p.x * 0.7 + t * 0.9) + sin(p.y * 0.9 - t * 0.7) + sin((p.x + p.y) * 0.45 + t * 0.6)) * uWaveAmp * 0.33;
}
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  #ifdef WAVES
  w.y += waveHeight(w.xz, uTime);
  #endif
  vWorld = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

/** Fragment shader: depth from the terrain height texture drives colour and foam bands. */
export const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform float uOpacity;
uniform float uLevel;
uniform sampler2D uHeights;
uniform vec2 uInvSize;
uniform vec4 uHalf; // centre.xz, half-size.xz (metres)
uniform float uHasMap;
#include <fog_pars_fragment>
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz;
  float depth = 8.0;
  if (uHasMap > 0.5) {
    float h = texture2D(uHeights, clamp(p * uInvSize, 0.0, 1.0)).r;
    vec2 beyond = max(abs(p - uHalf.xy) - uHalf.zw, 0.0);
    depth = uLevel - h + length(beyond) * 0.5;
  }
  // Foam: a solid inner line and a softer outer band that laps in and out.
  float lap = sin(uTime * 0.9 + p.x * 0.8 + p.y * 0.6) * 0.5 + 0.5;
  float wob = sin(p.x * 2.3 + uTime * 1.3) * sin(p.y * 2.9 - uTime) * 0.06;
  float d = depth + wob;
  float line = 1.0 - step(0.2 + lap * 0.06, d);
  float band = 1.0 - step(0.55 + lap * 0.15, d);
  float foam = max(line, band * 0.5);
  float t = smoothstep(0.0, 2.5, depth);
  t = mix(t, floor(t * 3.0 + 0.5) / 3.0, 0.35);
  vec3 col = mix(uShallow, uDeep, t);
  #ifdef RIPPLES
  vec2 g = vec2(
    cos(p.x * 0.9 + uTime * 1.1) + cos(p.x * 0.5 + p.y * 0.7 - uTime * 0.8),
    cos(p.y * 1.1 - uTime * 0.9) + cos(p.y * 0.6 - p.x * 0.4 + uTime * 0.7));
  vec3 n = normalize(vec3(g.x * 0.08, 1.0, g.y * 0.08));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col = mix(col, vec3(0.75, 0.88, 1.0), fres * 0.3);
  // Soft toon sheen bands drifting over the surface, fading with distance.
  float sheen = step(0.9, sin(p.x * 0.55 + p.y * 0.4 + sin(p.y * 0.8 + uTime * 0.4) * 1.6 + uTime * 0.5));
  float near = 1.0 - smoothstep(25.0, 70.0, length(cameraPosition - vWorld));
  col = mix(col, uFoam, sheen * near * 0.08 * (1.0 - foam));
  #endif
  col = mix(col, uFoam, foam);
  float alpha = mix(max(uOpacity, 0.82), 1.0, smoothstep(0.3, 2.5, depth));
  alpha = mix(alpha, 1.0, foam);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
