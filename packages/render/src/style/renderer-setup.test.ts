import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { configureRenderer, type ColourPipelineTarget } from './renderer-setup.js';

describe('configureRenderer', () => {
  it('sets sRGB, AgX and exposure', () => {
    const r: ColourPipelineTarget = {
      outputColorSpace: THREE.LinearSRGBColorSpace,
      toneMapping: THREE.NoToneMapping,
      toneMappingExposure: 0,
    };
    configureRenderer(r);
    expect(r.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(r.toneMapping).toBe(THREE.AgXToneMapping);
    expect(r.toneMappingExposure).toBe(1);
  });
});
