declare module 'n8ao' {
  import type { Camera, Scene } from 'three';
  import type { Pass } from 'postprocessing';

  /** Settings object of the N8AO passes (subset used here). */
  export interface N8AOConfiguration {
    aoRadius: number;
    distanceFalloff: number;
    intensity: number;
    aoSamples: number;
    denoiseSamples: number;
    denoiseRadius: number;
    denoiseIterations: number;
    halfRes: boolean;
    accumulate: boolean;
    gammaCorrection: boolean;
  }

  /** Ambient occlusion pass for pmndrs/postprocessing (follows a `RenderPass`). */
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: N8AOConfiguration;
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
