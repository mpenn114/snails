import { describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '@snails/protocol';
import { createDisplayAudio } from './display-audio';

const msg = (m: unknown): ServerMessage => m as ServerMessage;

function setup() {
  const port = { play: vi.fn(), startMusic: vi.fn(), stopMusic: vi.fn() };
  return { port, a: createDisplayAudio(port, { map: () => [{ id: 'fire' }] }) };
}

describe('display audio', () => {
  it('starts and stops music with the match', () => {
    const { port, a } = setup();
    a.handle(msg({ type: 'matchStarted' }));
    expect(port.startMusic).toHaveBeenCalled();
    a.handle(msg({ type: 'lobbyState', phase: 'playing' }));
    expect(port.stopMusic).not.toHaveBeenCalled();
    a.handle(msg({ type: 'lobbyState', phase: 'lobby' }));
    expect(port.stopMusic).toHaveBeenCalled();
    a.handle(msg({ type: 'other' }));
  });
  it('warns once per second under 5 s', () => {
    const { port, a } = setup();
    a.handle(msg({ type: 'turnStart', snailId: 's' }));
    for (const ms of [9000, 4900, 4500, 3900, 0]) {
      a.handle(msg({ type: 'turnTimer', remainingMs: ms }));
    }
    expect(port.play).toHaveBeenCalledTimes(2);
  });
  it('squelches when the active snail crawls on the ground', () => {
    const { port, a } = setup();
    a.handle(msg({ type: 'turnStart', snailId: 's' }));
    const snap = (x: number, state: number) =>
      msg({
        type: 'snapshot',
        tick: 1,
        wind: [0, 0],
        projectiles: [],
        statuses: [],
        areas: [],
        turn: [null, null, 0, 0, 0],
        snails: [['s', x, 0, 0, 0, 0, 0, 0, 100, state, 0, 0]],
      });
    a.handle(snap(0, 1));
    a.handle(snap(0, 1));
    expect(port.play).not.toHaveBeenCalled();
    a.handle(snap(100, 1));
    expect(port.play).toHaveBeenCalledWith({ id: 'squelch' });
  });
  it('does not beat with unknown health', () => {
    const { port, a } = setup();
    a.tick(1000);
    expect(port.play).not.toHaveBeenCalled();
  });
});
