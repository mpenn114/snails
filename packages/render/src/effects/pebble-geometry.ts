import * as THREE from 'three';
import { PALETTE } from '../style/palette.js';

/** Triangles in the pebble (a jittered icosahedron). */
export const PEBBLE_TRIANGLES = 20;

/** Trail puff colour: `uiPaper` reads on grass, soil, water and sky (delta E well above 25). */
export const TRAIL_COLOUR = PALETTE.uiPaper;

/** Deterministic radial jitter in [1-amp, 1+amp] from a unit position (same point, same value). */
export function pebbleJitter(x: number, y: number, z: number, amp = 0.14): number {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return 1 + amp * (2 * (h - Math.floor(h)) - 1);
}

/**
 * Builds the chunky low-poly pebble (radius about 1, flat-shaded, slightly squashed): a jittered
 * icosahedron with `uiAccent` faces and `uiPaper` highlight facets on top, as vertex colours
 * (sRGB converted to linear). 20 triangles, well inside the projectile budget.
 */
export function buildPebbleGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const j = pebbleJitter(pos.getX(i), pos.getY(i), pos.getZ(i));
    pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j * 0.85, pos.getZ(i) * j);
  }
  geo.computeVertexNormals();
  const colours = new Float32Array(pos.count * 3);
  const accent = new THREE.Color(PALETTE.uiAccent);
  const paper = new THREE.Color(PALETTE.uiPaper);
  const n = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let f = 0; f < pos.count; f += 3) {
    const c = n.getY(f) > 0.45 ? paper : accent;
    for (let v = 0; v < 3; v++) c.toArray(colours, (f + v) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geo;
}
