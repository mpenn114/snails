import { describe, expect, it } from 'vitest';
import { createAimStore } from './aim-store';

describe('AimStore', () => {
  it('ignores aim mode off my turn and clears it when the turn ends', () => {
    const s = createAimStore();
    s.setAimMode(true);
    expect(s.state.aimMode).toBe(false);
    s.setMyTurn(true);
    s.setAimMode(true);
    s.setAim(0.4, 0.7);
    expect(s.state.aimMode).toBe(true);
    expect(s.state.aim).toEqual({ angle: 0.4, power: 0.7 });
    s.setMyTurn(false);
    expect(s.state.aimMode).toBe(false);
    expect(s.state.aim).toBeNull();
  });

  it('notifies only on real changes and supports unsubscribe', () => {
    const s = createAimStore();
    const seen: boolean[] = [];
    const off = s.subscribe((st) => seen.push(st.aimMode));
    s.setMyTurn(true);
    s.setAimMode(true);
    s.setAimMode(true);
    s.setAimMode(false);
    off();
    s.setAimMode(true);
    expect(seen).toEqual([false, true, false]);
  });
});
