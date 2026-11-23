import { LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ANISOTROPY,
  createNeutralTexture,
  loadTerrainTextures,
  pickTextureSet,
  type TerrainTextureSet,
  type TerrainTextureSources,
} from './terrain-textures.js';

const set = (p: string): TerrainTextureSet => {
  const l = (n: string): { color: string; normal: string } => ({
    color: `${p}-${n}`,
    normal: `${p}-${n}-n`,
  });
  return { grass: l('grass'), dirt: l('dirt'), rock: l('rock') };
};
const SOURCES: TerrainTextureSources = { full: set('f'), compact: set('c') };

describe('terrain textures', () => {
  it('picks the full set for detail tiers and strips normals from the compact set', () => {
    expect(pickTextureSet(SOURCES, true)).toBe(SOURCES.full);
    const c = pickTextureSet(SOURCES, false);
    expect(c.grass).toEqual({ color: 'c-grass' });
    expect(c.rock.normal).toBeUndefined();
  });
  it('neutral textures are mid grey and a flat normal', () => {
    const grey = createNeutralTexture('color').image.data as Uint8Array;
    const flat = createNeutralTexture('normal').image.data as Uint8Array;
    expect([...grey]).toEqual([128, 128, 128, 255]);
    expect([...flat]).toEqual([128, 128, 255, 255]);
  });
  it('loads and configures every map', async () => {
    const fetchTexture = vi.fn(() => Promise.resolve(new Texture()));
    const t = await loadTerrainTextures(SOURCES.full, fetchTexture);
    expect(fetchTexture).toHaveBeenCalledTimes(6);
    expect(t.grass.color.colorSpace).toBe(SRGBColorSpace);
    expect(t.grass.normal?.colorSpace).not.toBe(SRGBColorSpace);
    expect(t.dirt.color.wrapS).toBe(RepeatWrapping);
    expect(t.dirt.color.minFilter).toBe(LinearMipmapLinearFilter);
    expect(t.rock.color.anisotropy).toBe(DEFAULT_ANISOTROPY);
    const t1 = await loadTerrainTextures(SOURCES.full, fetchTexture, 1);
    expect(t1.rock.color.anisotropy).toBe(1);
  });
  it('disposes loaded maps and rejects when one fails', async () => {
    const fetchTexture = (u: string): Promise<Texture> =>
      u === 'f-rock-n' ? Promise.reject(new Error('404')) : Promise.resolve(new Texture());
    const spy = vi.spyOn(Texture.prototype, 'dispose');
    await expect(loadTerrainTextures(SOURCES.full, fetchTexture)).rejects.toThrow('404');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
