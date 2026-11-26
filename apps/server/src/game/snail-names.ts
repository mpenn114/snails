import { MAX_SNAIL_NAMES, SNAIL_NAME_POOL } from '@snails/protocol';

/**
 * Names for one team's snails: the team's custom names first, then defaults from the name pool
 * (spread by team index so teams rarely share names), then `<team> <n>` as a last resort.
 * @param team the session team
 * @param teamIndex position of the team in the match
 * @param count snails per team
 */
export function snailNamesFor(
  team: { name: string; snailNames?: readonly string[] },
  teamIndex: number,
  count: number,
): string[] {
  return Array.from(
    { length: count },
    (_, i) =>
      team.snailNames?.[i] ||
      SNAIL_NAME_POOL[(teamIndex * MAX_SNAIL_NAMES + i) % SNAIL_NAME_POOL.length] ||
      `${team.name} ${i + 1}`,
  );
}
