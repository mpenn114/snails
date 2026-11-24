import * as THREE from 'three';
import { PALETTE } from '../style/palette.js';

/** Weapon ids drawn as a missile instead of a pebble. */
export const MISSILE_WEAPON_IDS: ReadonlySet<string> = new Set(['base:radula-missile']);

/** Pieces of a missile: [geometry, colour]. All point along +Z (nose at +Z), length about 3. */
function missileParts(): [THREE.BufferGeometry, number][] {
  const body = new THREE.CylinderGeometry(0.34, 0.34, 1.6, 8, 1);
  body.rotateX(Math.PI / 2);
  const nose = new THREE.ConeGeometry(0.34, 1.0, 8, 1);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 0, 1.3);
  const tail = new THREE.ConeGeometry(0.34, 0.5, 8, 1);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0, -1.05);
  const parts: [THREE.BufferGeometry, number][] = [
    [body, PALETTE.uiPaper],
    [nose, PALETTE.uiAccent],
    [tail, PALETTE.uiInk],
  ];
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.BoxGeometry(0.06, 0.8, 0.6);
    fin.translate(0, 0.5, -0.7);
    fin.rotateZ((i * Math.PI * 2) / 3);
    parts.push([fin, PALETTE.uiAccent]);
  }
  return parts;
}

/**
 * Builds the sleek low-poly missile (flat-shaded, vertex colours, about 130 triangles): paper
 * body, accent nose and three accent fins, ink exhaust cone. Points along +Z, centred near the
 * origin, scaled by the layer from the projectile radius. Positions and colours only (the
 * toon material needs no UVs); non-indexed so it can be merged by plain concatenation.
 */
export function buildMissileGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colours: number[] = [];
  const tmp = new THREE.Color();
  for (const [part, hex] of missileParts()) {
    const g = part.index ? part.toNonIndexed() : part;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    tmp.set(hex);
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      colours.push(tmp.r, tmp.g, tmp.b);
    }
    g.dispose();
    part.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  return geo;
}
