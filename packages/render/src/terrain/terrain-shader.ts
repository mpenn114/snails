/**
 * GLSL chunks injected into MeshToonMaterial for textured, palette-tinted terrain.
 *
 * Layers (grass, dirt, rock) are sampled in world space (triplanar on full tiers, one projected
 * sample per layer when `TERRAIN_SINGLE_SAMPLE` is defined). The source textures are neutralised
 * offline (mean 0.5), so `palette * texture * 2` keeps the palette hue and only adds detail.
 */

/** Declarations added to the vertex shader. */
export const TERRAIN_VERTEX_PARS = /* glsl */ `
attribute vec4 aMatW;
varying vec4 vMatW;
varying vec3 vTerrainWorldPos;
varying vec3 vTerrainWorldNormal;
`;

/** Statements appended after `<begin_vertex>`. */
export const TERRAIN_VERTEX_MAIN = /* glsl */ `
vMatW = aMatW;
vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

/** Declarations added to the fragment shader (needs `TERRAIN_BLASTS` defined). */
export const TERRAIN_FRAGMENT_PARS = /* glsl */ `
varying vec4 vMatW;
varying vec3 vTerrainWorldPos;
varying vec3 vTerrainWorldNormal;
uniform vec3 uTerrainSand;
uniform vec3 uTerrainClay;
uniform vec3 uTerrainSnow;
uniform float uTerrainWater;
uniform float uTerrainSnowStart;
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
uniform sampler2D uTerrainOrigH;
uniform vec2 uTerrainOrigScale;

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
  // Interpolated normals of thin walls can cancel to ~0: never normalise that (NaN -> white).
  vec3 tn = vTerrainWorldNormal;
  float tnl = dot(tn, tn);
  tn = tnl > 1e-6 ? tn * inversesqrt(tnl) : vec3(0.0, 1.0, 0.0);
  gTerrainN = tn;
  vec3 tw = pow(abs(tn), vec3(4.0));
  gTerrainTriW = tw / max(tw.x + tw.y + tw.z, 1e-4);

  float wob = terrainNoise(wp * 0.45) - 0.5;
  float wob2 = terrainNoise(wp * 0.3 + vec3(0.0, 4.0, 9.0)) - 0.5;
  vec2 bl = terrainBlasts(wp, wob);

  vec3 dGrass = mix(vec3(1.0), terrainSample(uTerrainTexGrass, wp, uTerrainTexScale.x) * 2.0, uTerrainTexContrast.x);
  vec3 dDirt = mix(vec3(1.0), terrainSample(uTerrainTexDirt, wp, uTerrainTexScale.y) * 2.0, uTerrainTexContrast.y);
  vec3 dRock = mix(vec3(1.0), terrainSample(uTerrainTexRock, wp, uTerrainTexScale.z) * 2.0, uTerrainTexContrast.z);

  float h = wp.y + wob2 * 2.0;
  float depth = 1.0 - smoothstep(uTerrainDeepHeight - uTerrainDeepBand, uTerrainDeepHeight, h);
  float up = tn.y;
  // Per-cell material (one-hot weights): sand, clay, rock. Soil is the remainder.
  float wS = vMatW.x;
  float wC = vMatW.y;
  float wR = vMatW.z;
  float solidMat = clamp(wS + wC + wR, 0.0, 1.0);
  float rockPatch = smoothstep(0.66, 0.8, terrainNoise(wp * vec3(0.22, 0.5, 0.22) + 9.0) + wob * 0.2 + depth * 0.25);
  float rockW = clamp((1.0 - smoothstep(0.42, 0.72, up + wob * 0.1)) + depth * 0.8 + rockPatch * 0.7, 0.0, 1.0);
  // Strata: horizontal bands by world height with a wobble, so walls read as layered.
  float strata = 0.5 + 0.5 * sin(wp.y * 2.4 + wob2 * 5.0 + wob * 2.0);
  float strataFine = 0.5 + 0.5 * sin(wp.y * 7.0 + wob * 6.0);
  // Soft noisy grass edge: the grass texture's own lightness roughens the boundary.
  float edge = up + wob * 0.18 + (dGrass.g - 1.0) * 0.12;
  float grassW = smoothstep(0.62, 0.8, edge) * (1.0 - bl.x) * (1.0 - solidMat);
  float carved = 0.0;
  float cave = 0.0;
  #ifdef TERRAIN_ORIGINAL_HEIGHT
  // Carved ground (below the originally generated surface) is bare earth, never grass.
  float origH = texture2D(uTerrainOrigH, wp.xz * uTerrainOrigScale).r;
  carved = smoothstep(0.2, 0.45, origH - wp.y + wob * 0.15);
  grassW *= 1.0 - carved;
  // Cave interior: the open side of this face is still under the original surface (a roof).
  float roofH = texture2D(uTerrainOrigH, (wp.xz + tn.xz * 2.0) * uTerrainOrigScale).r;
  cave = smoothstep(3.5, 8.0, roofH - wp.y);
  #endif
  // Pale beach on gentle ground just above the waterline (not on rock).
  float gentle = smoothstep(0.55, 0.8, up + wob * 0.1);
  float beach = (1.0 - smoothstep(uTerrainWater + 0.8, uTerrainWater + 1.7, wp.y + wob2 * 0.4)) * gentle * (1.0 - wR);
  grassW *= 1.0 - beach;

  vec3 dirt = mix(uTerrainSoil, uTerrainDeep, depth * 0.9) * dDirt;
  vec3 rock = mix(uTerrainRock, uTerrainDeep, depth * 0.35) * dRock * (0.82 + 0.3 * strata);
  vec3 grass = mix(uTerrainGrassEdge, uTerrainGrass, smoothstep(0.7, 0.92, edge)) * dGrass;
  vec3 sandC = uTerrainSand * mix(vec3(1.0), dDirt, 0.5) * (0.96 + 0.08 * strataFine);
  vec3 clayC = uTerrainClay * dDirt * (0.8 + 0.34 * strata);
  vec3 stone = mix(uTerrainRock, uTerrainDeep, depth * 0.3) * dRock * (0.78 + 0.34 * strata) * (0.94 + 0.1 * strataFine);
  // Soil steepens into rock; explicit materials colour the ground directly.
  vec3 col = mix(dirt, rock, rockW * (1.0 - carved * 0.85));
  col = mix(col, sandC, max(wS, beach));
  col = mix(col, clayC, wC);
  col = mix(col, stone, wR);
  col = mix(col, grass, grassW);
  gTerrainLayerW = vec3(grassW, (1.0 - grassW) * (1.0 - rockW - wR * 0.5), (1.0 - grassW) * clamp(rockW + wR * 0.5, 0.0, 1.0));

  // Wet band at the waterline.
  float wet = 1.0 - smoothstep(0.0, 0.9, wp.y - uTerrainWater - 0.1 + wob2 * 0.3);
  col *= 1.0 - 0.28 * wet;

  // Snow caps: only real peaks, gentle upward faces, never carved ground.
  float snow = smoothstep(uTerrainSnowStart, uTerrainSnowStart + 1.0, wp.y + wob2 * 1.2)
    * smoothstep(0.66, 0.86, up + wob * 0.12) * (1.0 - carved) * (1.0 - bl.x);
  col = mix(col, uTerrainSnow * (0.95 + 0.1 * terrainNoise(wp * 0.7)), snow);
  gTerrainLayerW *= 1.0 - snow * 0.6;

  // Cave interiors and undersides are dark.
  col *= 1.0 - 0.55 * cave;
  col *= 1.0 - 0.35 * smoothstep(0.1, -0.5, up);

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
#ifndef TERRAIN_NORMALS
normal = normalize((viewMatrix * vec4(gTerrainN, 0.0)).xyz);
#endif
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
  vec3 bumped = nX.zyx * gTerrainTriW.x + nY.xzy * gTerrainTriW.y + nZ.xyz * gTerrainTriW.z;
  bumped = dot(bumped, bumped) > 1e-8 ? normalize(bumped) : wn;
  normal = normalize((viewMatrix * vec4(bumped, 0.0)).xyz);
}
#endif
`;
