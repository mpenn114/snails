import { ShaderLib } from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createTerrainMaterial,
  createTerrainMaterialForTier,
  terrainMaterialOptionsForTier,
  triplanarWeights,
} from './terrain-material.js';

function compile(m: ReturnType<typeof createTerrainMaterial>): WebGLProgramParametersWithUniforms {
  const shader = {
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {},
  } as unknown as WebGLProgramParametersWithUniforms;
  m.onBeforeCompile(shader, null as never);
  return shader;
}

describe('triplanarWeights', () => {
  it('sums to 1 and favours the dominant axis', () => {
    const w = triplanarWeights(0.1, 0.9, 0.2, 4);
    expect(w[0] + w[1] + w[2]).toBeCloseTo(1);
    expect(w[1]).toBeGreaterThan(0.95);
  });
  it('sharper exponent concentrates weight', () => {
    expect(triplanarWeights(0.6, 0.8, 0, 8)[1]).toBeGreaterThan(
      triplanarWeights(0.6, 0.8, 0, 1)[1],
    );
  });
  it('handles zero normal', () => {
    expect(triplanarWeights(0, 0, 0, 4)).toEqual([0, 1, 0]);
  });
});

describe('terrain material', () => {
  it('maps tiers to options', () => {
    expect(terrainMaterialOptionsForTier('mobile').detail).toBe(false);
    expect(terrainMaterialOptionsForTier('high').detail).toBe(true);
  });
  it('injects chunks and uniforms', () => {
    const m = createTerrainMaterial();
    const s = compile(m);
    expect(s.vertexShader).toContain('vTerrainWorldPos');
    expect(s.fragmentShader).toContain('terrainTriplanar');
    expect(s.fragmentShader).toContain('diffuseColor.rgb *= col');
    expect(s.uniforms).toHaveProperty('uTerrainGrass');
    expect(m.defines).toHaveProperty('TERRAIN_DETAIL');
  });
  it('cheap tier has no detail define', () => {
    const m = createTerrainMaterialForTier('mobile');
    expect(m.defines).not.toHaveProperty('TERRAIN_DETAIL');
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
