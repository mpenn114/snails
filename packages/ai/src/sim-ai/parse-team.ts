import { DIFFICULTIES, PERSONALITIES, type Difficulty, type Personality } from '../cpu/types.js';
import type { AiTeamSpec } from './types.js';

/** Parses `difficulty:personality` (for example `rookie:aggressive`); throws on bad input. */
export function parseTeamSpec(text: string): AiTeamSpec {
  const [d, p] = text.split(':');
  if (!DIFFICULTIES.includes(d as Difficulty) || !PERSONALITIES.includes(p as Personality)) {
    throw new Error(
      `bad team spec "${text}", expected <${DIFFICULTIES.join('|')}>:<${PERSONALITIES.join('|')}>`,
    );
  }
  return { difficulty: d as Difficulty, personality: p as Personality };
}
