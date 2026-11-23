import { ShaderLib } from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { getToonGradient } from '../style/materials.js';
import {
  TERRAIN_BLAST_SLOTS,
  createTerrainMaterial,
  createTerrainMaterialForTier,
  terrainMaterialOptionsForTier,
  type TerrainMaterial,
} from './terrain-material.js';

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
    expect(s.fragmentShader).toContain('TERRAIN_SOFT_FACETS');
    expect(s.fragmentShader).toContain('diffuseColor.rgb *= col');
    for (const k of ['uTerrainGrass', 'uTerrainGrassEdge', 'uTerrainScorch', 'uTerrainBlast']) {
      expect(s.uniforms).toHaveProperty(k);
    }
    const blast = s.uniforms.uTerrainBlast as { value: unknown };
    expect(blast.value).toBe(m.scorch.centres);
    expect((s.uniforms.uTerrainBlastK as { value: unknown }).value).toBe(m.scorch.strength);
    m.scorch.add(1, 2, 3, 4);
    expect(m.scorch.centres[0]?.w).toBe(4);
  });
  it('uses the shared toon gradient and flat facets on the full tier', () => {
    const m = createTerrainMaterial();
    expect(m.gradientMap).toBe(getToonGradient(3));
    expect((m as unknown as { flatShading: boolean }).flatShading).toBe(true);
    expect(m.defines).toMatchObject({ TERRAIN_FULL: '', TERRAIN_BLASTS: '16' });
  });
  it('mobile variant is cheaper: soft facets, 2 bands, fewer blast slots', () => {
    const m = createTerrainMaterialForTier('mobile');
    expect(m.defines).not.toHaveProperty('TERRAIN_FULL');
    expect(m.defines).toHaveProperty('TERRAIN_SOFT_FACETS');
    expect(m.scorch.capacity).toBe(TERRAIN_BLAST_SLOTS.cheap);
    expect(m.gradientMap).toBe(getToonGradient(2));
    expect(m.customProgramCacheKey()).not.toBe(createTerrainMaterial().customProgramCacheKey());
  });
  it('disposes', () => {
    const m = createTerrainMaterial();
    const spy = vi.fn();
    m.addEventListener('dispose', spy);
    m.dispose();
    expect(spy).toHaveBeenCalled();
  });
});
