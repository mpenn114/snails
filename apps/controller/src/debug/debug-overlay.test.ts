import { describe, expect, it } from 'vitest';
import { debugRequested, formatDebugLines } from './debug-overlay';

describe('debug overlay helpers', () => {
  it('detects ?debug', () => {
    expect(debugRequested('?room=ABCD&debug')).toBe(true);
    expect(debugRequested('?room=ABCD')).toBe(false);
  });
  it('formats lines', () => {
    const lines = formatDebugLines({
      rttMs: 12.4,
      cmdP50: 20,
      cmdP90: 50,
      cmdCount: 7,
      snapshotHz: 19.96,
      fps: 59.6,
    });
    expect(lines).toEqual([
      'RTT 12 ms',
      'cmd->effect p50 20 / p90 50 ms (n=7)',
      'snapshots 20.0 /s',
      'fps 60',
    ]);
    expect(
      formatDebugLines({
        ...{ rttMs: undefined, cmdP50: 0, cmdP90: 0, cmdCount: 0, snapshotHz: 0, fps: 0 },
      })[0],
    ).toBe('RTT --');
  });
});
