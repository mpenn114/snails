import { describe, expect, it } from 'vitest';
import { Heartbeat, type HeartbeatTimers } from './heartbeat.js';

function setup() {
  let now = 0;
  let fn: (() => void) | undefined;
  const timers: HeartbeatTimers = {
    setInterval: (f) => ((fn = f), 1),
    clearInterval: () => void (fn = undefined),
  };
  const log: string[] = [];
  const hb = new Heartbeat(
    { intervalMs: 5000, timeoutMs: 15_000, timers, now: () => now },
    () => log.push('ping'),
    () => log.push('timeout'),
  );
  const tick = (ms: number): void => {
    now += ms;
    fn?.();
  };
  return { hb, log, tick };
}

describe('Heartbeat', () => {
  it('pings while traffic keeps arriving', () => {
    const { hb, log, tick } = setup();
    for (let i = 0; i < 5; i++) {
      tick(5000);
      hb.seen();
    }
    expect(log).toEqual(['ping', 'ping', 'ping', 'ping', 'ping']);
  });

  it('times out once after the silence limit and stops', () => {
    const { log, tick } = setup();
    for (let i = 0; i < 6; i++) tick(5000);
    expect(log).toEqual(['ping', 'ping', 'timeout']);
  });
});
