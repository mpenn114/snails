/** GLSL chunks injected into MeshToonMaterial for stylised low-poly terrain shading. */

/** Declarations added to the vertex shader. */
export const TERRAIN_VERTEX_PARS = /* glsl */ `
varying vec3 vTerrainWorldPos;
varying vec3 vTerrainWorldNormal;
`;

/** Statements appended after `<begin_vertex>`. */
export const TERRAIN_VERTEX_MAIN = /* glsl */ `
vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

/** Declarations added to the fragment shader (needs `TERRAIN_BLASTS` defined). */
export const TERRAIN_FRAGMENT_PARS = /* glsl */ `
varying vec3 vTerrainWorldPos;
varying vec3 vTerrainWorldNormal;
uniform vec3 uTerrainGrass;
uniform vec3 uTerrainGrassEdge;
uniform vec3 uTerrainSoil;
uniform vec3 uTerrainRock;
uniform vec3 uTerrainDeep;
uniform vec3 uTerrainScorch;
uniform float uTerrainDeepHeight;
uniform float uTerrainDeepBand;
uniform float uTerrainStrata;
uniform vec4 uTerrainBlast[TERRAIN_BLASTS];
uniform float uTerrainBlastK[TERRAIN_BLASTS];

float terrainHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float terrainNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(terrainHash(i), terrainHash(i + vec3(1,0,0)), f.x),
        mix(terrainHash(i + vec3(0,1,0)), terrainHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(terrainHash(i + vec3(0,0,1)), terrainHash(i + vec3(1,0,1)), f.x),
        mix(terrainHash(i + vec3(0,1,1)), terrainHash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
// Crater exposure (x: grass removed) and scorch strength (y) from recent explosions.
vec2 terrainBlasts(vec3 p, float wob) {
  float expose = 0.0;
  float burn = 0.0;
  for (int i = 0; i < TERRAIN_BLASTS; i++) {
    vec4 b = uTerrainBlast[i];
    if (b.w <= 0.0) continue;
    float d = distance(p, b.xyz) + wob * 0.5;
    expose = max(expose, 1.0 - smoothstep(b.w + 0.15, b.w + 0.5, d));
    burn = max(burn, uTerrainBlastK[i] * (1.0 - smoothstep(b.w + 0.05, b.w + 1.0, d)));
  }
  return vec2(expose, burn);
}
`;

/**
 * Replaces `<normal_fragment_begin>`: on the cheap tier blends the smooth normal with the facet
 * normal (hides facet aliasing). Full tiers use real flat shading and skip the blend.
 */
export const TERRAIN_NORMAL_BLEND = /* glsl */ `
#include <normal_fragment_begin>
#ifdef TERRAIN_SOFT_FACETS
  normal = normalize(mix(normal, normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition))), 0.6));
#endif
`;

/** Replaces `<color_fragment>`; `TERRAIN_FULL` enables the extra noise octave and jitter. */
export const TERRAIN_FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 wp = vTerrainWorldPos;
  vec3 fn = normalize(cross(dFdx(wp), dFdy(wp)));
  #ifdef TERRAIN_SOFT_FACETS
    vec3 tn = normalize(vTerrainWorldNormal);
  #else
    vec3 tn = fn;
  #endif
  float wob = terrainNoise(wp * 0.45) - 0.5;
  float wob2 = wob;
  #ifdef TERRAIN_FULL
    wob2 = terrainNoise(wp * 0.3 + vec3(0.0, 4.0, 9.0)) - 0.5;
    wob += (terrainNoise(wp * 1.3) - 0.5) * 0.3;
  #endif
  vec2 bl = terrainBlasts(wp, wob);

  // Strata: horizontal soil / deepSoil bands with wobbly boundaries, darker with depth.
  float h = wp.y + wob2 * 2.0;
  float band = h / uTerrainStrata;
  float f = fract(band);
  float stripe = smoothstep(0.38, 0.5, f) * (1.0 - smoothstep(0.88, 1.0, f));
  float bi = floor(band);
  vec3 soil = mix(uTerrainSoil, uTerrainDeep, clamp(stripe * 0.18 + terrainHash(vec3(bi, 1.0, 2.0)) * 0.06, 0.0, 1.0));
  float depth = 1.0 - smoothstep(uTerrainDeepHeight - uTerrainDeepBand, uTerrainDeepHeight, h);
  soil = mix(soil, uTerrainDeep, depth * 0.9);

  // Rock: patches in deep strata and on steep walls.
  float rn = terrainNoise(wp * vec3(0.22, 0.5, 0.22) + 9.0) + wob * 0.2;
  float wall = 1.0 - smoothstep(0.1, 0.45, tn.y);
  float rockM = smoothstep(0.6, 0.68, rn + depth * 0.2 + wall * 0.1);
  vec3 col = mix(soil, uTerrainRock, rockM);

  // Grass cap on up-facing facets, wavy edge, darker grassEdge rim.
  float up = tn.y + wob * 0.2;
  float grassW = smoothstep(0.56, 0.64, up) * (1.0 - bl.x);
  vec3 grass = mix(uTerrainGrassEdge, uTerrainGrass, smoothstep(0.62, 0.86, up));
  col = mix(col, grass, grassW);

  // Scorch around fresh craters.
  col = mix(col, uTerrainScorch, bl.y * 0.78);

  #ifdef TERRAIN_FULL
    // Per-facet colour jitter (hand-made low-poly feel), about +-4%.
    float j = terrainHash(floor(fn * 7.0) + floor(dot(fn, wp) * 2.0)) - 0.5;
    col *= 1.0 + j * 0.05;
  #endif
  diffuseColor.rgb *= col;
}
`;
