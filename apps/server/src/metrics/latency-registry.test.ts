import { describe, expect, it } from 'vitest';
import { LatencyRegistry } from './latency-registry.js';

describe('LatencyRegistry', () => {
  it('records receive->applied->broadcast and logs at match end', () => {
    let t = 0;
    const lines: string[] = [];
    const reg = new LatencyRegistry({ now: () => t, log: (l) => lines.push(l) });
    expect(reg.report('R')).toBeUndefined();
    t = 10;
    reg.intentApplied('R', 8, 5);
    reg.snapshotSent('R', 5); // not later than applied tick: stays pending
    t = 30;
    reg.snapshotSent('R', 6);
    const r = reg.report('R');
    expect(r?.intents).toBe(1);
    expect(r?.receiveToApplied.count).toBe(1);
    expect(r?.appliedToBroadcast.p50).toBe(20);
    expect(r?.receiveToBroadcast.p50).toBe(30);
    expect(reg.reportAll()).toHaveLength(1);
    reg.matchEnded('R');
    expect(lines[0]).toContain('room=R intents=1');
    expect(reg.report('R')).toBeUndefined();
    reg.matchEnded('R');
    expect(lines).toHaveLength(1);
  });

  it('ignores snapshots for unknown rooms and caps pending', () => {
    const reg = new LatencyRegistry({ now: () => 1 });
    reg.snapshotSent('X', 1);
    for (let i = 0; i < 300; i++) reg.intentApplied('X', 0, 1);
    reg.snapshotSent('X', 2);
    expect(reg.report('X')?.appliedToBroadcast.count).toBe(256);
  });
});
