/**
 * GLSL chunks injected into MeshToonMaterial for textured, palette-tinted terrain.
 *
 * Layers (grass, dirt, rock) are sampled in world space (triplanar on full tiers, one projected
 * sample per layer when `TERRAIN_SINGLE_SAMPLE` is defined). The source textures are neutralised
 * offline (mean 0.5), so `palette * texture * 2` keeps the palette hue and only adds detail.
 */

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
uniform vec3 uTerrainTexScale;
uniform vec3 uTerrainTexContrast;
uniform float uTerrainNormalStrength;
uniform sampler2D uTerrainTexGrass;
uniform sampler2D uTerrainTexDirt;
uniform sampler2D uTerrainTexRock;
#ifdef TERRAIN_NORMALS
uniform sampler2D uTerrainNrmGrass;
uniform sampler2D uTerrainNrmDirt;
uniform sampler2D uTerrainNrmRock;
#endif
uniform vec4 uTerrainBlast[TERRAIN_BLASTS];
uniform float uTerrainBlastK[TERRAIN_BLASTS];

// Shared between the colour and normal chunks.
vec3 gTerrainLayerW;
vec3 gTerrainTriW;
vec3 gTerrainN;

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
// World-space texture lookup: triplanar (3 samples) or one projected sample on cheap tiers.
vec3 terrainSample(sampler2D t, vec3 p, float s) {
  #ifdef TERRAIN_SINGLE_SAMPLE
    vec3 a = abs(gTerrainN);
    vec2 uv = a.y >= max(a.x, a.z) ? p.xz : (a.x > a.z ? p.zy : p.xy);
    return texture2D(t, uv * s).rgb;
  #else
    return texture2D(t, p.zy * s).rgb * gTerrainTriW.x
      + texture2D(t, p.xz * s).rgb * gTerrainTriW.y
      + texture2D(t, p.xy * s).rgb * gTerrainTriW.z;
  #endif
}
`;

/** Replaces `<color_fragment>`: layer weights, texture detail, palette tint and scorch. */
export const TERRAIN_FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 wp = vTerrainWorldPos;
  vec3 tn = normalize(vTerrainWorldNormal);
  gTerrainN = tn;
  vec3 tw = pow(abs(tn), vec3(4.0));
  gTerrainTriW = tw / (tw.x + tw.y + tw.z);

  float wob = terrainNoise(wp * 0.45) - 0.5;
  float wob2 = terrainNoise(wp * 0.3 + vec3(0.0, 4.0, 9.0)) - 0.5;
  vec2 bl = terrainBlasts(wp, wob);

  vec3 dGrass = mix(vec3(1.0), terrainSample(uTerrainTexGrass, wp, uTerrainTexScale.x) * 2.0, uTerrainTexContrast.x);
  vec3 dDirt = mix(vec3(1.0), terrainSample(uTerrainTexDirt, wp, uTerrainTexScale.y) * 2.0, uTerrainTexContrast.y);
  vec3 dRock = mix(vec3(1.0), terrainSample(uTerrainTexRock, wp, uTerrainTexScale.z) * 2.0, uTerrainTexContrast.z);

  float h = wp.y + wob2 * 2.0;
  float depth = 1.0 - smoothstep(uTerrainDeepHeight - uTerrainDeepBand, uTerrainDeepHeight, h);
  float up = tn.y;
  float rockPatch = smoothstep(0.66, 0.8, terrainNoise(wp * vec3(0.22, 0.5, 0.22) + 9.0) + wob * 0.2 + depth * 0.25);
  float rockW = clamp((1.0 - smoothstep(0.3, 0.52, up + wob * 0.1)) + depth * 0.8 + rockPatch * 0.7, 0.0, 1.0);
  // Soft noisy grass edge: the grass texture's own lightness roughens the boundary.
  float edge = up + wob * 0.18 + (dGrass.g - 1.0) * 0.12;
  float grassW = smoothstep(0.62, 0.8, edge) * (1.0 - bl.x);

  vec3 dirt = mix(uTerrainSoil, uTerrainDeep, depth * 0.9) * dDirt;
  vec3 rock = mix(uTerrainRock, uTerrainDeep, depth * 0.35) * dRock;
  vec3 grass = mix(uTerrainGrassEdge, uTerrainGrass, smoothstep(0.7, 0.92, edge)) * dGrass;
  vec3 col = mix(mix(dirt, rock, rockW), grass, grassW);
  gTerrainLayerW = vec3(grassW, (1.0 - grassW) * (1.0 - rockW), (1.0 - grassW) * rockW);

  // Large soft blotches break up texture repetition.
  col *= 0.94 + 0.12 * terrainNoise(wp * 0.11 + 3.0);

  // Scorch around fresh craters.
  col = mix(col, uTerrainScorch * mix(vec3(1.0), dRock, 0.5), bl.y * 0.8);
  diffuseColor.rgb *= col;
}
`;

/**
 * Replaces `<normal_fragment_begin>`. With `TERRAIN_NORMALS` the layer normal maps are blended
 * triplanar (whiteout) into the smooth vertex normal; otherwise the standard normal is kept.
 */
export const TERRAIN_NORMAL_BLEND = /* glsl */ `
#include <normal_fragment_begin>
#ifdef TERRAIN_NORMALS
{
  vec3 p = vTerrainWorldPos;
  vec3 wn = gTerrainN;
  vec3 lw = gTerrainLayerW;
  vec3 s = uTerrainTexScale;
  vec3 nX = (texture2D(uTerrainNrmGrass, p.zy * s.x).xyz * lw.x + texture2D(uTerrainNrmDirt, p.zy * s.y).xyz * lw.y + texture2D(uTerrainNrmRock, p.zy * s.z).xyz * lw.z) * 2.0 - 1.0;
  vec3 nY = (texture2D(uTerrainNrmGrass, p.xz * s.x).xyz * lw.x + texture2D(uTerrainNrmDirt, p.xz * s.y).xyz * lw.y + texture2D(uTerrainNrmRock, p.xz * s.z).xyz * lw.z) * 2.0 - 1.0;
  vec3 nZ = (texture2D(uTerrainNrmGrass, p.xy * s.x).xyz * lw.x + texture2D(uTerrainNrmDirt, p.xy * s.y).xyz * lw.y + texture2D(uTerrainNrmRock, p.xy * s.z).xyz * lw.z) * 2.0 - 1.0;
  nX = vec3(nX.xy * uTerrainNormalStrength + wn.zy, abs(nX.z) * wn.x);
  nY = vec3(nY.xy * uTerrainNormalStrength + wn.xz, abs(nY.z) * wn.y);
  nZ = vec3(nZ.xy * uTerrainNormalStrength + wn.xy, abs(nZ.z) * wn.z);
  vec3 bumped = normalize(nX.zyx * gTerrainTriW.x + nY.xzy * gTerrainTriW.y + nZ.xyz * gTerrainTriW.z);
  normal = normalize((viewMatrix * vec4(bumped, 0.0)).xyz);
}
#endif
`;
