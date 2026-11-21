import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, parseClientMessage, parseServerMessage } from './index.js';

describe('protocol', () => {
  it('parses a valid hello', () => {
    const m = parseClientMessage({
      type: 'hello',
      role: 'controller',
      name: 'Ann',
      roomCode: 'ABCD',
      protocolVersion: PROTOCOL_VERSION,
    });
    expect(m.type).toBe('hello');
  });
  it('rejects bad version and unknown types', () => {
    expect(() =>
      parseClientMessage({ type: 'hello', role: 'display', name: 'x', roomCode: 'A', protocolVersion: 99 }),
    ).toThrow();
    expect(() => parseClientMessage({ type: 'nope' })).toThrow();
  });
  it('validates intents', () => {
    expect(parseClientMessage({ type: 'aim', angle: 45, power: 0.5 }).type).toBe('aim');
    expect(() => parseClientMessage({ type: 'aim', angle: 45, power: 2 })).toThrow();
  });
  it('parses server messages', () => {
    expect(parseServerMessage({ type: 'error', code: 'x', message: 'y' }).type).toBe('error');
  });
});
