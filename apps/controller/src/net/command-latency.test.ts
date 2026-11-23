import { describe, expect, it } from 'vitest';
import { CommandLatency } from './command-latency';

describe('CommandLatency', () => {
  it('records send to reflecting snapshot after ack', () => {
    const c = new CommandLatency();
    c.sent(1, 100);
    c.snapshot(5, 110); // not acked yet
    c.acked(1, 6);
    c.snapshot(6, 120); // same tick as applied: not yet reflected
    expect(c.summary().count).toBe(0);
    c.snapshot(7, 140);
    expect(c.summary().count).toBe(1);
    expect(c.summary().p50).toBe(50);
    c.snapshot(8, 150);
    expect(c.summary().count).toBe(1);
  });
  it('ignores unknown acks, caps pending, meters snapshots', () => {
    const c = new CommandLatency();
    c.acked(9, 1);
    for (let i = 0; i < 100; i++) c.sent(i, 0);
    c.acked(0, 1);
    c.snapshot(2, 10);
    expect(c.summary().count).toBe(0);
    expect(c.snapshotRate(10)).toBeGreaterThan(0);
  });
});
