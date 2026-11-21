import { describe, expect, it } from 'vitest';
import { ContentRegistry } from './registry.js';

describe('ContentRegistry', () => {
  it('registers, gets, lists and rejects duplicates', () => {
    const r = new ContentRegistry<{ id: string }>();
    r.register({ id: 'a' });
    expect(r.get('a')).toEqual({ id: 'a' });
    expect(r.list()).toHaveLength(1);
    expect(() => r.register({ id: 'a' })).toThrow(/Duplicate/);
  });
});
