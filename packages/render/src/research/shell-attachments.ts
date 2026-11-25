import * as THREE from 'three';
import { shellPatternForTeam } from '../snail/shell-pattern.js';
import { TEAM_GLYPHS } from '../style/team-glyphs.js';

/** How an attachment is laid out on the shell. */
export interface AttachmentDef {
  /** Canonical piece kind drawn by the renderer. */
  kind: 'spikes' | 'plates' | 'antenna' | 'rope' | 'flag';
  /** Number of instances placed on the silhouette ring. */
  count: number;
  /** Ring radius as a fraction of the shell radius. */
  radius: number;
  /** Extra rotation about Z added to the outward tilt. */
  extraTilt: number;
}

/** Content attachment names (tech `visual.attachments`) mapped to renderer pieces. */
export const ATTACHMENT_REGISTRY: Readonly<Record<string, AttachmentDef>> = {
  spikes: { kind: 'spikes', count: 6, radius: 0.95, extraTilt: 0 },
  plates: { kind: 'plates', count: 4, radius: 0.8, extraTilt: Math.PI / 2 },
  'plating-light': { kind: 'plates', count: 4, radius: 0.8, extraTilt: Math.PI / 2 },
  antenna: { kind: 'antenna', count: 1, radius: 0.9, extraTilt: 0 },
  'rope-coil': { kind: 'rope', count: 1, radius: 0.35, extraTilt: 0 },
  flag: { kind: 'flag', count: 1, radius: 0.85, extraTilt: 0 },
};

/** Looks up a renderer attachment by content name; undefined for unknown names. */
export function attachmentDef(name: string): AttachmentDef | undefined {
  return Object.hasOwn(ATTACHMENT_REGISTRY, name) ? ATTACHMENT_REGISTRY[name] : undefined;
}

/** Index of the decal emblem for a team; aligned with {@link TEAM_GLYPHS} / the shell pattern. */
export function decalIndexForTeam(teamIndex: number): number {
  return shellPatternForTeam(teamIndex) % TEAM_GLYPHS.length;
}

type Pt = [number, number];

const ngon = (n: number, rot: number): Pt[] =>
  Array.from({ length: n }, (_, i): Pt => {
    const a = rot + (i / n) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  });

const star = (): Pt[] =>
  Array.from({ length: 10 }, (_, i): Pt => {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.42;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });

const plus = (t: number): Pt[] => [
  [-t, 1],
  [t, 1],
  [t, t],
  [1, t],
  [1, -t],
  [t, -t],
  [t, -1],
  [-t, -1],
  [-t, -t],
  [-1, -t],
  [-1, t],
  [-t, t],
];

const rotate45 = (pts: Pt[]): Pt[] =>
  pts.map(([x, y]): Pt => [(x - y) * Math.SQRT1_2, (x + y) * Math.SQRT1_2]);

/** Unit-size outline of a team's decal (index from {@link decalIndexForTeam}), matching its glyph. */
export function decalOutline(index: number): Pt[] {
  const i = ((Math.trunc(index) % 8) + 8) % 8;
  switch (i) {
    case 0:
      return ngon(3, Math.PI / 2);
    case 1:
      return ngon(4, Math.PI / 4);
    case 2:
      return ngon(4, 0);
    case 3:
      return star();
    case 4:
      return plus(0.34);
    case 5:
      return ngon(6, 0);
    case 6:
      return ngon(3, -Math.PI / 2);
    default:
      return rotate45(plus(0.3));
  }
}

const cache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

function mergeSimple(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const pa = a.toNonIndexed();
  const pb = b.toNonIndexed();
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const x = pa.getAttribute(name) as THREE.BufferAttribute;
    const y = pb.getAttribute(name) as THREE.BufferAttribute;
    const arr = new Float32Array(x.array.length + y.array.length);
    arr.set(x.array as Float32Array);
    arr.set(y.array as Float32Array, x.array.length);
    merged.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return merged;
}

function flagGeometry(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4);
  const cloth = new THREE.BufferGeometry();
  cloth.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0.25, 0, 0, 0.05, 0, 0.26, 0.15, 0], 3),
  );
  cloth.computeVertexNormals();
  return mergeSimple(pole, cloth);
}

/** Shared (module-cached) geometry for an attachment kind; never dispose per snail. */
export function attachmentGeometry(kind: AttachmentDef['kind']): THREE.BufferGeometry {
  return cached(kind, () => {
    switch (kind) {
      case 'spikes':
        return new THREE.ConeGeometry(0.1, 0.34, 5);
      case 'plates':
        return new THREE.BoxGeometry(0.34, 0.1, 0.1);
      case 'antenna':
        return new THREE.CylinderGeometry(0.02, 0.03, 0.5, 4);
      case 'rope':
        return new THREE.TorusGeometry(0.3, 0.05, 4, 10);
      default:
        return flagGeometry();
    }
  });
}

/** One Chaikin corner-cutting pass: softens sharp corners so the emblem reads as painted. */
function rounded(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length] as Pt;
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  });
  return out;
}

/**
 * Shared flat decal geometry for a team emblem: corners softened, `inset` 1 is the full
 * outline (dark rim) and a smaller value the lighter painted fill inside it.
 */
export function decalGeometry(index: number, inset = 1): THREE.BufferGeometry {
  const i = ((Math.trunc(index) % 8) + 8) % 8;
  return cached(`decal${i}|${inset}`, () => {
    const pts = rounded(rounded(decalOutline(i))).map(
      ([x, y]) => new THREE.Vector2(x * inset, y * inset),
    );
    return new THREE.ShapeGeometry(new THREE.Shape(pts));
  });
}
