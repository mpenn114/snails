import { LinearFilter, RepeatWrapping, SRGBColorSpace, ShaderLib, Texture } from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { getToonGradient } from '../style/materials.js';
import {
  DEFAULT_SNOW_START,
  TERRAIN_BLAST_SLOTS,
  createSoftToonRamp,
  createTerrainMaterial,
  createTerrainMaterialForTier,
  terrainMaterialOptionsForTier,
  type TerrainMaterial,
} from './terrain-material.js';
import type { TerrainTextureSources } from './terrain-textures.js';

const layer = (n: string, p: string): Record<string, { color: string; normal?: string }> => ({
  [n]: p === 'f' ? { color: `f-${n}`, normal: `fn-${n}` } : { color: `c-${n}` },
});
const SOURCES = {
  full: Object.assign({}, layer('grass', 'f'), layer('dirt', 'f'), layer('rock', 'f')),
  compact: Object.assign({}, layer('grass', 'c'), layer('dirt', 'c'), layer('rock', 'c')),
} as unknown as TerrainTextureSources;

function compile(m: TerrainMaterial): WebGLProgramParametersWithUniforms {
  const shader = {
    vertexShader: ShaderLib.toon?.vertexShader,
    fragmentShader: ShaderLib.toon?.fragmentShader,
    uniforms: {},
  } as unknown as WebGLProgramParametersWithUniforms;
  m.onBeforeCompile(shader, null as never);
  return shader;
}

describe('terrain material', () => {
  it('maps tiers to options', () => {
    expect(terrainMaterialOptionsForTier('mobile').detail).toBe(false);
    expect(terrainMaterialOptionsForTier('high').detail).toBe(true);
  });
  it('injects chunks and wires uniforms to the scorch ring', () => {
    const m = createTerrainMaterial();
    const s = compile(m);
    expect(s.vertexShader).toContain('vTerrainWorldPos');
    expect(s.fragmentShader).toContain('terrainBlasts');
    expect(s.fragmentShader).toContain('TERRAIN_SINGLE_SAMPLE');
    expect(s.fragmentShader).toContain('diffuseColor.rgb *= col');
    const keys = ['uTerrainGrass', 'uTerrainScorch', 'uTerrainBlast', 'uTerrainTexGrass'];
    for (const k of [...keys, 'uTerrainNrmRock', 'uTerrainTexScale']) {
      expect(s.uniforms).toHaveProperty(k);
    }
    const blast = s.uniforms.uTerrainBlast as { value: unknown };
    expect(blast.value).toBe(m.scorch.centres);
    expect((s.uniforms.uTerrainBlastK as { value: unknown }).value).toBe(m.scorch.strength);
    m.scorch.add(1, 2, 3, 4);
    expect(m.scorch.centres[0]?.w).toBe(4);
  });
  it('full tier: soft toon ramp, smooth normals, triplanar with normal maps', () => {
    const m = createTerrainMaterial();
    expect(m.gradientMap).not.toBe(getToonGradient(3));
    expect(m.gradientMap?.magFilter).toBe(LinearFilter);
    expect((m as unknown as { flatShading?: boolean }).flatShading).toBeFalsy();
    expect(m.defines).toMatchObject({
      TERRAIN_FULL: '',
      TERRAIN_NORMALS: '',
      TERRAIN_BLASTS: '16',
    });
    expect(m.defines).not.toHaveProperty('TERRAIN_SINGLE_SAMPLE');
  });
  it('mobile variant is cheaper: one sample per layer, no normals, 2 bands, fewer blasts', () => {
    const m = createTerrainMaterialForTier('mobile');
    expect(m.defines).toHaveProperty('TERRAIN_SINGLE_SAMPLE');
    expect(m.defines).not.toHaveProperty('TERRAIN_FULL');
    expect(m.defines).not.toHaveProperty('TERRAIN_NORMALS');
    expect(m.scorch.capacity).toBe(TERRAIN_BLAST_SLOTS.cheap);
    expect(m.customProgramCacheKey()).not.toBe(createTerrainMaterial().customProgramCacheKey());
  });
  it('wires material weights, snow, waterline and NaN-safe normals into the shader', () => {
    const s = compile(createTerrainMaterial({ waterLevel: 2.5, snowStart: 18 }));
    expect(s.vertexShader).toContain('attribute vec4 aMatW');
    expect(s.fragmentShader).toContain('vMatW');
    expect(s.fragmentShader).toContain('uTerrainSnowStart');
    expect(s.fragmentShader).toContain('tnl > 1e-6');
    expect((s.uniforms.uTerrainWater as { value: number }).value).toBe(2.5);
    expect((s.uniforms.uTerrainSnowStart as { value: number }).value).toBe(18);
    expect(compile(createTerrainMaterial()).uniforms.uTerrainSnowStart).toMatchObject({
      value: DEFAULT_SNOW_START,
    });
  });
  it('soft ramp keeps the band levels away from the edges', () => {
    const t = createSoftToonRamp(3);
    const d = t.image.data as Uint8Array;
    expect(d[0]).toBe(Math.round(0.58 * 255));
    expect(d[(t.image.width - 1) * 4]).toBe(255);
    const mid = d[Math.floor(t.image.width * 0.45) * 4] as number;
    expect(mid).toBeGreaterThan(Math.round(0.7 * 255));
    expect(mid).toBeLessThan(Math.round(0.85 * 255));
  });
  it('uses the palette fallback without textures', async () => {
    const m = createTerrainMaterial();
    const s = compile(m);
    expect(await m.texturesReady).toBe(false);
    expect(m.texturesLoaded).toBe(false);
    const u = s.uniforms.uTerrainTexGrass as { value: Texture };
    expect(u.value.image.data[0]).toBe(128);
  });
  it('swaps in loaded textures and keeps the fallback if loading fails', async () => {
    const urls: string[] = [];
    const fetchTexture = (url: string): Promise<Texture> => {
      urls.push(url);
      return Promise.resolve(new Texture());
    };
    const m = createTerrainMaterial({ textures: SOURCES, fetchTexture });
    const s = compile(m);
    const before = (s.uniforms.uTerrainTexGrass as { value: Texture }).value;
    expect(await m.texturesReady).toBe(true);
    expect(m.texturesLoaded).toBe(true);
    expect(urls).toHaveLength(6);
    const grass = (s.uniforms.uTerrainTexGrass as { value: Texture }).value;
    expect(grass).not.toBe(before);
    expect(grass.colorSpace).toBe(SRGBColorSpace);
    expect(grass.wrapS).toBe(RepeatWrapping);
    const bad = createTerrainMaterial({
      textures: SOURCES,
      fetchTexture: () => Promise.reject(new Error('404')),
    });
    const sb = compile(bad);
    expect(await bad.texturesReady).toBe(false);
    expect((sb.uniforms.uTerrainTexGrass as { value: Texture }).value.image.data[0]).toBe(128);
  });
  it('mobile loads only the compact colour maps', async () => {
    const urls: string[] = [];
    const m = createTerrainMaterialForTier('mobile', {
      textures: SOURCES,
      fetchTexture: (url) => (urls.push(url), Promise.resolve(new Texture())),
    });
    expect(await m.texturesReady).toBe(true);
    expect(urls.sort()).toEqual(['c-dirt', 'c-grass', 'c-rock']);
  });
  it('disposes', () => {
    const m = createTerrainMaterial();
    const spy = vi.fn();
    m.addEventListener('dispose', spy);
    m.dispose();
    expect(spy).toHaveBeenCalled();
  });
});
