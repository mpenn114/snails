import * as THREE from 'three';

/** A point or offset in body space. */
export type Vec3 = [number, number, number];

/** Hermite smoothstep of `x` between `a` and `b` (works for a > b too). */
export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A swept surface: `rings` of `m` points each, optional single-point caps at either end. */
export interface Sweep {
  rings: Vec3[][];
  colour: (k: number, j: number) => THREE.Color;
  start?: Vec3;
  end?: Vec3;
  startColour?: THREE.Color;
  endColour?: THREE.Color;
}

/** Converts a sweep into an indexed, outward-wound, vertex-coloured geometry. */
export function sweepGeometry(s: Sweep): THREE.BufferGeometry {
  const n = s.rings.length;
  const m = (s.rings[0] as Vec3[]).length;
  const pos: number[] = [];
  const col: number[] = [];
  s.rings.forEach((ring, k) =>
    ring.forEach((p, j) => {
      pos.push(...p);
      col.push(...s.colour(k, j).toArray());
    }),
  );
  const index: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < m; j++) {
      const a = k * m + j;
      const a1 = k * m + ((j + 1) % m);
      const b = a + m;
      const b1 = a1 + m;
      index.push(a, b, a1, a1, b, b1);
    }
  }
  const cap = (p: Vec3, c: THREE.Color, ringIdx: number, flip: boolean): void => {
    const ci = pos.length / 3;
    pos.push(...p);
    col.push(...c.toArray());
    for (let j = 0; j < m; j++) {
      const a = ringIdx * m + j;
      const a1 = ringIdx * m + ((j + 1) % m);
      if (flip) index.push(ci, a1, a);
      else index.push(ci, a, a1);
    }
  };
  if (s.start) cap(s.start, s.startColour ?? s.colour(0, 0), 0, false);
  if (s.end) cap(s.end, s.endColour ?? s.colour(n - 1, 0), n - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Builds a tapered tube along `path` with per-ring radii (tip capped). */
export function tube(
  path: Vec3[],
  radii: number[],
  sides: number,
  colour: THREE.Color,
): THREE.BufferGeometry {
  const rings = path.map((pt, k) => {
    const next = path[Math.min(k + 1, path.length - 1)] as Vec3;
    const prev = path[Math.max(k - 1, 0)] as Vec3;
    const t = new THREE.Vector3(
      next[0] - prev[0],
      next[1] - prev[1],
      next[2] - prev[2],
    ).normalize();
    const ref = Math.abs(t.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const nrm = ref.clone().cross(t).normalize();
    const bin = nrm.clone().cross(t);
    const r = radii[k] as number;
    return Array.from({ length: sides }, (_, j): Vec3 => {
      const a = (j / sides) * Math.PI * 2;
      const o = nrm
        .clone()
        .multiplyScalar(Math.cos(a) * r)
        .addScaledVector(bin, Math.sin(a) * r);
      return [pt[0] + o.x, pt[1] + o.y, pt[2] + o.z];
    });
  });
  const last = path[path.length - 1] as Vec3;
  return sweepGeometry({ rings, colour: () => colour, end: last });
}

/** Paints every vertex of `g` with a single colour. */
export function paint(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
