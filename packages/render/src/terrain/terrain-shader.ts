/** GLSL chunks injected into MeshStandardMaterial for terrain shading. */

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

/** Declarations added to the fragment shader. */
export const TERRAIN_FRAGMENT_PARS = /* glsl */ `
varying vec3 vTerrainWorldPos;
varying vec3 vTerrainWorldNormal;
uniform vec3 uTerrainGrass;
uniform vec3 uTerrainSoil;
uniform vec3 uTerrainRock;
uniform vec3 uTerrainDeep;
uniform float uTerrainSharpness;
uniform float uTerrainDeepHeight;
uniform float uTerrainDeepBand;
uniform float uTerrainScale;

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
// Triplanar-blended noise sampled in world space.
float terrainTriplanar(vec3 p, vec3 w) {
  float a = terrainNoise(vec3(p.y, p.z, 0.0));
  float b = terrainNoise(vec3(p.x, p.z, 3.7));
  float c = terrainNoise(vec3(p.x, p.y, 7.3));
  return a * w.x + b * w.y + c * w.z;
}
`;

/** Replaces `<color_fragment>`; `TERRAIN_DETAIL` enables per-fragment noise. */
export const TERRAIN_FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 tn = normalize(vTerrainWorldNormal);
  float up = tn.y;
  float grassW = smoothstep(0.55, 0.8, up);
  float ceilW = smoothstep(-0.2, -0.6, up);
  vec3 pos = vTerrainWorldPos;
  float detail = 0.5;
  #ifdef TERRAIN_DETAIL
    vec3 tw = pow(abs(tn), vec3(uTerrainSharpness));
    tw /= max(tw.x + tw.y + tw.z, 1e-4);
    vec3 sp = pos * uTerrainScale;
    detail = terrainTriplanar(sp, tw) * 0.65 + terrainTriplanar(sp * 4.3, tw) * 0.35;
    grassW = clamp(grassW + (detail - 0.5) * 0.35, 0.0, 1.0);
  #endif
  vec3 steepCol = mix(uTerrainSoil, uTerrainRock, smoothstep(0.2, 0.7, 1.0 - abs(up)));
  steepCol = mix(steepCol, uTerrainSoil, ceilW);
  float deep = 1.0 - smoothstep(uTerrainDeepHeight - uTerrainDeepBand, uTerrainDeepHeight, pos.y);
  vec3 col = mix(steepCol, uTerrainGrass, grassW * (1.0 - deep));
  col = mix(col, uTerrainDeep, deep);
  col *= 0.8 + 0.4 * detail;
  diffuseColor.rgb *= col;
}
`;
