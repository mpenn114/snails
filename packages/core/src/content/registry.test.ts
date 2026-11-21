import { describe, expect, it } from 'vitest';
import { ContentError, ContentRegistry } from './registry.js';

type Item = { id: string; n?: number };

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof ContentError ? err.code : 'OTHER';
  }
  return undefined;
}

describe('ContentRegistry', () => {
  it('registers, gets, lists and reports size', () => {
    const r = new ContentRegistry<Item>();
    r.register({ id: 'a' });
    expect(r.get('a')).toEqual({ id: 'a' });
    expect(r.has('a')).toBe(true);
    expect(r.has('zz')).toBe(false);
    expect(r.size).toBe(1);
    expect(r.list()).toHaveLength(1);
  });

  it('throws ContentError DUPLICATE_ID on duplicate ids', () => {
    const r = new ContentRegistry<Item>();
    r.register({ id: 'a' });
    expect(codeOf(() => r.register({ id: 'a' }))).toBe('DUPLICATE_ID');
    expect(() => r.register({ id: 'a' })).toThrow(/Duplicate/);
  });

  it('require returns the item or throws UNKNOWN_ID', () => {
    const r = new ContentRegistry<Item>();
    r.register({ id: 'a', n: 1 });
    expect(r.require('a').n).toBe(1);
    expect(codeOf(() => r.require('missing'))).toBe('UNKNOWN_ID');
  });

  it('lists sorted by id regardless of registration order', () => {
    const r = new ContentRegistry<Item>();
    ['base:c', 'base:a', 'alt:z', 'base:b'].forEach((id) => r.register({ id }));
    expect(r.list().map((i) => i.id)).toEqual(['alt:z', 'base:a', 'base:b', 'base:c']);

    const r2 = new ContentRegistry<Item>();
    ['base:b', 'alt:z', 'base:c', 'base:a'].forEach((id) => r2.register({ id }));
    expect(r2.list()).toEqual(r.list());
  });

  it('list returns a fresh array', () => {
    const r = new ContentRegistry<Item>();
    r.register({ id: 'a' });
    r.list().pop();
    expect(r.list()).toHaveLength(1);
  });

  it('freeze blocks further registration with FROZEN but keeps reads working', () => {
    const r = new ContentRegistry<Item>();
    r.register({ id: 'a' });
    expect(r.isFrozen).toBe(false);
    r.freeze();
    r.freeze();
    expect(r.isFrozen).toBe(true);
    expect(codeOf(() => r.register({ id: 'b' }))).toBe('FROZEN');
    expect(r.has('b')).toBe(false);
    expect(r.require('a').id).toBe('a');
  });
});
