/** Parses `x.y.z` into numbers, or null if malformed. */
export function parseSemver(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Tests a version against a small semver range grammar: `*`, exact `x.y.z`, `>=x.y.z`,
 * `^x.y.z` (same major; same minor while major is 0) and `~x.y.z` (same major and minor).
 * @returns `true`/`false`, or `null` if the range or version is malformed.
 */
export function satisfiesRange(version: string, range: string): boolean | null {
  const v = parseSemver(version);
  if (!v) return null;
  if (range === '*') return true;
  const m = /^(\^|~|>=)?(\d+\.\d+\.\d+)$/.exec(range);
  const base = m ? parseSemver(m[2] ?? '') : null;
  if (!m || !base) return null;
  const op = m[1] ?? '';
  if (op === '') return compare(v, base) === 0;
  if (compare(v, base) < 0) return false;
  if (op === '>=') return true;
  if (op === '~') return v[0] === base[0] && v[1] === base[1];
  return v[0] === base[0] && (base[0] !== 0 || v[1] === base[1]);
}
