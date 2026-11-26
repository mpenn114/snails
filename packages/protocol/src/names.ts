/** Longest team or snail name, in characters. */
export const NAME_MAX = 16;
/** Most snail names a player stores (the match setting `snailsPerTeam` goes up to this). */
export const MAX_SNAIL_NAMES = 8;

/** Fun default team names, picked at random for each new team. */
export const TEAM_NAME_POOL: readonly string[] = [
  'Slime Squad',
  'Shell Shockers',
  'Slow Burners',
  'Salt Shakers',
  'Trail Blazers',
  'Garden Gang',
  'Lettuce Lords',
  'Spiral Force',
  'Goo Crew',
  'Mucus Mob',
  'Cabbage Patrol',
  'Slimy Bunch',
  'Shell Yeah',
  'Turbo Snailers',
  'The Escargots',
  'Dew Drop Inn',
];

/** Fun default snail names, picked at random for each new snail. */
export const SNAIL_NAME_POOL: readonly string[] = [
  'Gary',
  'Turbo',
  'Sheldon',
  'Slimer',
  'Escargot',
  'Speedy',
  'Gooey',
  'Brutus',
  'Nibbles',
  'Spiral',
  'Dewey',
  'Mollusc',
  'Slick',
  'Shelly',
  'Pebble',
  'Basil',
  'Clover',
  'Moss',
  'Zippy',
  'Bumble',
  'Fern',
  'Tiny Tim',
  'Sir Slugsalot',
  'Dot',
];

/**
 * Cleans a user-entered name: control characters removed, whitespace collapsed, trimmed and
 * cut to `max` characters (by code point, so emoji are never split). HTML is NOT stripped
 * here; renderers escape (or use `textContent`).
 * @param raw the entered text
 * @param max length limit (default {@link NAME_MAX})
 */
export function sanitiseName(raw: string, max: number = NAME_MAX): string {
  const clean = [...raw]
    .map((c) => (/[\p{Cc}\p{Cf}]/u.test(c) ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return [...clean].slice(0, max).join('').trim();
}

/**
 * Sanitises `raw`, or returns `fallback` when nothing is left.
 * @param raw the entered text
 * @param fallback value for an empty result
 */
export function nameOr(raw: string, fallback: string): string {
  return sanitiseName(raw) || fallback;
}

/**
 * Picks `count` names from `pool` avoiding `taken` (case-insensitive) while possible; when the
 * pool runs dry a numeric suffix keeps names unique. Returned names are not added to `taken`.
 * @param pool candidate names
 * @param count how many to pick
 * @param taken names already in use
 * @param random injectable `[0,1)` source
 */
export function pickNames(
  pool: readonly string[],
  count: number,
  taken: ReadonlySet<string>,
  random: () => number = Math.random,
): string[] {
  const used = new Set([...taken].map((t) => t.toLowerCase()));
  const free = pool.filter((n) => !used.has(n.toLowerCase()));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let name: string;
    if (free.length > 0) {
      name = free.splice(Math.floor(random() * free.length) % free.length, 1)[0] as string;
    } else {
      const base = pool[Math.floor(random() * pool.length) % pool.length] ?? 'Snail';
      let n = 2;
      while (used.has(`${base} ${n}`.toLowerCase())) n++;
      name = `${base} ${n}`.slice(0, NAME_MAX);
    }
    used.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}
