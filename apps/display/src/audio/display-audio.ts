import { createEventCueMapper, heartbeatIntervalMs } from '@snails/render';
import type { CueRequest, EventCueMapper } from '@snails/render';
import { decodeEventBatch, decodeSnapshot } from '@snails/protocol';
import type { ServerMessage } from '@snails/protocol';
import type { SimEvent } from '@snails/core';

/** The slice of the shared synth the director drives (tests inject a fake). */
export interface CuePort {
  play(req: CueRequest): void;
  startMusic(): void;
  stopMusic(): void;
}

/** Turn clock warnings start below this many ms remaining. */
export const WARN_BELOW_MS = 5000;

/** The active snail must move this far (m) horizontally between snapshots to squelch. */
export const CRAWL_STEP_M = 0.04;

/** Maps server messages to cues, the music bed and the low-health heartbeat. */
export interface DisplayAudio {
  /** Feed every server message. */
  handle(msg: ServerMessage): void;
  /** Call on a timer (about every 100 ms); plays the heartbeat when it is due. */
  tick(nowMs: number): void;
}

/**
 * Creates the display audio director.
 * @param port cue sink
 * @param mapper event mapper (default: no shell materials)
 */
export function createDisplayAudio(
  port: CuePort,
  mapper: EventCueMapper = createEventCueMapper(),
): DisplayAudio {
  let activeSnail: string | null = null;
  let activeHealth = Infinity;
  let lastWarnSec = Infinity;
  let nextBeat = 0;
  let lastPos: { x: number; z: number } | null = null;

  const handle = (msg: ServerMessage): void => {
    switch (msg.type) {
      case 'matchStarted':
        port.startMusic();
        return;
      case 'lobbyState':
        if (msg.phase === 'lobby') {
          port.stopMusic();
          activeSnail = null;
        }
        return;
      case 'turnStart':
        activeSnail = msg.snailId;
        lastPos = null;
        lastWarnSec = Infinity;
        return;
      case 'snapshot': {
        const me = decodeSnapshot(msg).snails.find((s) => s.id === activeSnail);
        activeHealth = me?.health ?? Infinity;
        const moved =
          me?.state === 'grounded' &&
          lastPos !== null &&
          Math.hypot(me.position.x - lastPos.x, me.position.z - lastPos.z) >= CRAWL_STEP_M;
        lastPos = me?.state === 'grounded' ? { x: me.position.x, z: me.position.z } : null;
        if (moved) port.play({ id: 'squelch' });
        return;
      }
      case 'turnTimer': {
        const sec = Math.ceil(msg.remainingMs / 1000);
        if (msg.remainingMs <= 0 || msg.remainingMs >= WARN_BELOW_MS || sec >= lastWarnSec) return;
        lastWarnSec = sec;
        port.play({ id: 'timerWarning' });
        return;
      }
      case 'eventBatch':
        for (const c of mapper.map(decodeEventBatch(msg) as unknown as SimEvent[])) port.play(c);
        return;
      default:
        return;
    }
  };
  const tick = (nowMs: number): void => {
    const every = heartbeatIntervalMs(activeHealth);
    if (every === null || nowMs < nextBeat) return;
    nextBeat = nowMs + every;
    port.play({ id: 'heartbeat' });
  };
  return { handle, tick };
}
