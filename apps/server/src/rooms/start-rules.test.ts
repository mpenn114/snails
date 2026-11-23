import { describe, expect, it } from 'vitest';
import { startBlocker } from './start-rules.js';

const p = (teamIds: string[], ready = true) => ({ teamIds, ready });

describe('startBlocker', () => {
  it('perPlayer needs one team per phone and two teams', () => {
    expect(startBlocker([p(['A']), p(['B'])], 'perPlayer')).toBeUndefined();
    expect(startBlocker([p(['A']), p(['A'])], 'perPlayer')).toMatch(/two teams/);
    expect(startBlocker([p(['A', 'B'])], 'perPlayer')).toMatch(/only one team/);
    expect(startBlocker([p([]), p(['B'])], 'perPlayer')).toMatch(/pick a team/);
    expect(startBlocker([p(['A']), p(['B'], false)], 'perPlayer')).toMatch(/ready/);
  });

  it('hotSeat lets one phone cover several teams', () => {
    expect(startBlocker([p(['A', 'B'])], 'hotSeat')).toBeUndefined();
    expect(startBlocker([p(['A']), p(['A', 'B'])], 'hotSeat')).toBeUndefined();
    expect(startBlocker([p(['A'])], 'hotSeat')).toMatch(/two teams/);
    expect(startBlocker([p([])], 'hotSeat')).toMatch(/pick a team/);
  });
});
