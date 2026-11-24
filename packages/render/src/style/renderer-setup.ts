import * as THREE from 'three';
import { LIGHTING } from './palette.js';

/** Minimal renderer surface touched by {@link configureRenderer}. */
export type ColourPipelineTarget = Pick<
  THREE.WebGLRenderer,
  'outputColorSpace' | 'toneMapping' | 'toneMappingExposure'
>;

/** Applies the shared colour pipeline: sRGB output, AgX tone mapping, exposure from LIGHTING. */
export function configureRenderer(renderer: ColourPipelineTarget): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = LIGHTING.exposure;
}
