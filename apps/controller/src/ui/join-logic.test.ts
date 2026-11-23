import { describe, expect, it } from 'vitest';
import { canJoin, isValidName, normaliseRoom, parseRoomParam, statusText } from './join-logic';

describe('join-logic', () => {
  it('parses and normalises the room deep link', () => {
    expect(parseRoomParam('?room=abcd')).toBe('ABCD');
    expect(parseRoomParam('?room=abcdef')).toBe('ABCD');
    expect(parseRoomParam('')).toBe('');
    expect(normaliseRoom('a1b-c')).toBe('ABC');
  });
  it('validates name and join readiness', () => {
    expect(isValidName('  ')).toBe(false);
    expect(isValidName('x'.repeat(33))).toBe(false);
    expect(canJoin('Bob', 'ABCD', false)).toBe(true);
    expect(canJoin('Bob', 'ABC', false)).toBe(false);
    expect(canJoin('Bob', 'ABCD', true)).toBe(false);
    expect(canJoin('', 'ABCD', false)).toBe(false);
  });
  it('maps states and errors to text', () => {
    expect(statusText('closed', 'no_room')).toMatch(/not found/);
    expect(statusText('closed', 'room_full')).toMatch(/full/);
    expect(statusText('mismatch', 'protocol_mismatch')).toMatch(/refresh/);
    expect(statusText('closed', 'bad_session')).toMatch(/expired/);
    expect(statusText('connecting', undefined)).toMatch(/Connecting/);
    expect(statusText('reconnecting', undefined)).toMatch(/Reconnecting/);
    expect(statusText('closed', 'internal')).toMatch(/Could not/);
    expect(statusText('open', undefined)).toBe('');
  });
});
