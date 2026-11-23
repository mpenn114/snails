import { describe, expect, it } from 'vitest';
import { createSessionGate } from './session-gate';

describe('createSessionGate', () => {
  it('mounts once, keeps on re-welcome, resets when the player changes', () => {
    const g = createSessionGate();
    expect(g.onWelcome('p1')).toBe('mount');
    expect(g.onWelcome('p1')).toBe('keep');
    expect(g.onWelcome('p1')).toBe('keep');
    expect(g.onWelcome('p2')).toBe('reset');
    expect(g.onWelcome('p2')).toBe('keep');
  });
});
