import * as THREE from 'three';
import { PALETTE } from '../style/palette.js';
import { buildMissileGeometry } from './missile-geometry.js';
import { buildPebbleGeometry, pebbleJitter, TRAIL_COLOUR } from './pebble-geometry.js';

/** Visual family of a projectile; chosen from the weapon id, the sim knows nothing of it. */
export type ProjectileLook = 'pebble' | 'roller' | 'drill' | 'missile';

/** Weapons with their own look; every other weapon uses the pebble. */
const LOOKS: Readonly<Record<string, ProjectileLook>> = {
  'base:pebble-roller': 'roller',
  'base:shell-drill': 'drill',
  'base:radula-missile': 'missile',
};

/** Look for a weapon id (the plain pebble when it has none of its own). */
export function lookFor(weaponId: string): ProjectileLook {
  return LOOKS[weaponId] ?? 'pebble';
}

/** Size multiplier of a look relative to the projectile radius (the roller is a big stone). */
export const LOOK_SCALE: Readonly<Record<ProjectileLook, number>> = {
  pebble: 1.9,
  roller: 2.4,
  drill: 2.6,
  missile: 1.9,
};

/** Spin rate in rad/s about the flight axis (the drill bit turns fast, the stone tumbles). */
export const LOOK_SPIN: Readonly<Record<ProjectileLook, number>> = {
  pebble: 7,
  roller: 5,
  drill: 28,
  missile: 0,
};

/** Trail colour of a look: paper smoke for stones, soil dust for the drill. */
export const LOOK_TRAIL: Readonly<Record<ProjectileLook, number>> = {
  pebble: TRAIL_COLOUR,
  roller: TRAIL_COLOUR,
  drill: PALETTE.soil,
  missile: TRAIL_COLOUR,
};

function paint(geo: THREE.BufferGeometry, pick: (face: number, ny: number) => THREE.Color): void {
  const n = geo.getAttribute('normal') as THREE.BufferAttribute;
  const count = n.count;
  const colours = new Float32Array(count * 3);
  for (let f = 0; f < count; f += 3) {
    const c = pick(f / 3, n.getY(f));
    for (let v = 0; v < 3; v++) c.toArray(colours, (f + v) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}

/**
 * Heavy round stone: a jittered subdivided icosahedron (80 triangles) in rock grey with
 * `uiPaper` highlights on top and `uiInk` shadow facets below.
 */
export function buildRollerGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const j = pebbleJitter(pos.getX(i), pos.getY(i), pos.getZ(i), 0.08);
    pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j, pos.getZ(i) * j);
  }
  geo.computeVertexNormals();
  const rock = new THREE.Color(PALETTE.rock);
  const paper = new THREE.Color(PALETTE.uiPaper);
  const ink = new THREE.Color(PALETTE.uiInk);
  paint(geo, (face, ny) => (ny > 0.55 ? paper : ny < -0.5 ? ink : face % 3 === 0 ? ink : rock));
  return geo;
}

/** Number of lengthwise flutes (sides) of the drill bit. */
const DRILL_FLUTES = 6;
/** Total twist of the flutes from base to tip, radians. */
const DRILL_TWIST = Math.PI * 1.2;

/**
 * Spinning drill bit: a six-sided cone pointing along +Z with its flutes twisted into a spiral,
 * alternating `uiAccent` and `uiPaper` faces. 24 triangles. The layer spins it about +Z.
 */
export function buildDrillGeometry(): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(0.6, 2, DRILL_FLUTES, 4, true);
  geo.rotateX(Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const a = ((1 - pos.getZ(i)) / 2) * DRILL_TWIST;
    pos.setXY(i, x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
  }
  const flat = geo.toNonIndexed();
  geo.dispose();
  flat.computeVertexNormals();
  const accent = new THREE.Color(PALETTE.uiAccent);
  const paper = new THREE.Color(PALETTE.uiPaper);
  paint(flat, (face) => (Math.floor(face / 2) % 2 === 0 ? accent : paper));
  return flat;
}

/** Builds the geometry of one look. */
export function buildLookGeometry(look: ProjectileLook): THREE.BufferGeometry {
  if (look === 'roller') return buildRollerGeometry();
  if (look === 'drill') return buildDrillGeometry();
  if (look === 'missile') return buildMissileGeometry();
  return buildPebbleGeometry();
}
