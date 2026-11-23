import { describe, expect, it } from 'vitest';
import { debugRequested, formatDisplayDebug, mountDebugOverlay } from './debug-overlay';

describe('display debug overlay', () => {
  it('detects ?debug', () => {
    expect(debugRequested('?debug')).toBe(true);
    expect(debugRequested('?room=X')).toBe(false);
  });
  it('formats lines', () => {
    expect(formatDisplayDebug({ snapshotHz: 19.5, fps: 59.7, tick: 12 })).toEqual([
      'snapshots 19.5 /s',
      'fps 60',
      'tick 12',
    ]);
    expect(formatDisplayDebug({ snapshotHz: 0, fps: 0, tick: undefined })[2]).toBe('tick --');
  });
  it('is inert without ?debug', () => {
    const o = mountDebugOverlay('');
    o.onSnapshot(1);
    o.dispose();
  });
});
