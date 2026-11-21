import { describe, expect, it } from 'vitest';
import { createMatch } from './match.js';
import { playReplay, ReplayRecorder, type Replay } from './replay.js';
import { createScriptedBot } from './scripted-bot.js';
import type { SimEvent } from './events.js';
import { PEBBLE, testMatchOptions } from './test-match.js';

const TICK_CAP = 60 * 60 * 40;

function record(seed: number): { replay: Replay; events: SimEvent[] } {
  const options = testMatchOptions(seed);
  const { sim } = createMatch(options);
  const recorder = new ReplayRecorder(options, sim);
  const bots = ['a', 'b'].map((id) => createScriptedBot(id, PEBBLE));
  const events: SimEvent[] = [];
  while (sim.state.match.status === 'playing' && sim.state.tick < TICK_CAP) {
    for (const bot of bots) bot(sim);
    events.push(...sim.step());
  }
  return { replay: recorder.finish(sim), events };
}

describe('replay', () => {
  it('replays a recorded bot match identically after a JSON round trip', () => {
    const { replay, events } = record(7);
    expect(replay.commands.length).toBeGreaterThan(0);
    const copy = JSON.parse(JSON.stringify(replay)) as Replay;
    const result = playReplay(copy);
    expect(result.matches).toBe(true);
    expect(result.actualChecksum).toBe(result.expectedChecksum);
    expect(result.events).toEqual(events);
    expect(result.sim.state.tick).toBe(replay.finalTick);
  });

  it('detects a tampered command', () => {
    const { replay } = record(7);
    const copy = JSON.parse(JSON.stringify(replay)) as Replay;
    const idx = copy.commands.findIndex((c) => c.command.type === 'aim');
    expect(idx).toBeGreaterThanOrEqual(0);
    const cmd = copy.commands[idx]?.command as unknown as { power: number };
    cmd.power = cmd.power > 0.5 ? cmd.power - 0.3 : cmd.power + 0.3;
    const result = playReplay(copy);
    expect(result.matches).toBe(false);
    expect(result.actualChecksum).not.toBe(result.expectedChecksum);
  });
});
