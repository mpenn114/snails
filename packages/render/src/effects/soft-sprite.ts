import * as THREE from 'three';

/**
 * Builds RGBA bytes of a soft round sprite: white, alpha falling off smoothly from the centre
 * to zero at the rim (smoothstep of radius).
 * @param size - Texture edge length in pixels (>= 2).
 */
export function radialGradientData(size: number): Uint8Array<ArrayBuffer> {
  const n = Math.max(2, Math.floor(size));
  const data = new Uint8Array(n * n * 4);
  const half = (n - 1) / 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - half, y - half) / half;
      const t = Math.min(1, Math.max(0, 1 - d));
      const a = t * t * (3 - 2 * t);
      const k = (y * n + x) * 4;
      data[k] = 255;
      data[k + 1] = 255;
      data[k + 2] = 255;
      data[k + 3] = Math.round(a * 255);
    }
  }
  return data;
}

/**
 * Creates a soft round point-sprite texture (DOM-free DataTexture). Caller disposes it.
 * @param size - Edge length in pixels; default 32.
 */
export function createSoftSpriteTexture(size = 32): THREE.DataTexture {
  const n = Math.max(2, Math.floor(size));
  const tex = new THREE.DataTexture(radialGradientData(n), n, n, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Fireball radius multiplier over normalised age `t` in [0,1]: starts at 35% and grows to 85%
 * of the blast radius, never larger.
 */
export function fireballScale(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 0.35 + 0.5 * Math.sqrt(c);
}

/** Fireball opacity over normalised age `t`: quadratic fade from 0.55 to 0. */
export function fireballOpacity(t: number): number {
  const f = 1 - Math.min(1, Math.max(0, t));
  return 0.55 * f * f;
}
