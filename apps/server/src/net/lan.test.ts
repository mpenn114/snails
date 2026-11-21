import { describe, expect, it } from 'vitest';
import { findLanIPv4, joinUrl } from './lan.js';

describe('lan', () => {
  it('returns an IPv4 string and builds URLs', () => {
    expect(findLanIPv4()).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(joinUrl('1.2.3.4', 3000, 'ABCD')).toBe('http://1.2.3.4:3000/?room=ABCD');
  });
});
