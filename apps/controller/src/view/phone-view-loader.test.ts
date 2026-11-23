import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@snails/protocol';
import type { ControllerClient } from '../net/client';
import { attachPhoneView } from './phone-view-loader';
import type { PhoneViewLike } from './phone-view-loader';

function fakeClient(): {
  client: ControllerClient;
  emit: (m: ServerMessage) => void;
  subs: () => number;
} {
  const handlers = new Map<string, Set<(m: ServerMessage) => void>>();
  let subs = 0;
  const client = {
    on(type: string, h: (m: ServerMessage) => void) {
      let set = handlers.get(type);
      if (!set) handlers.set(type, (set = new Set()));
      set.add(h);
      subs++;
      return () => {
        set.delete(h);
        subs--;
      };
    },
  } as unknown as ControllerClient;
  return { client, emit: (m) => handlers.get(m.type)?.forEach((h) => h(m)), subs: () => subs };
}

function fakeView(): PhoneViewLike & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    mount: () => void log.push('mount'),
    onMessage: (m) => void log.push(m.type),
    dispose: () => void log.push('dispose'),
    setBatterySaver: (on) => void log.push(`saver:${on}`),
  };
}

const snap = (tick: number): ServerMessage => ({
  type: 'snapshot',
  tick,
  wind: [0, 0],
  turn: [null, null, 0, 0, 0],
  snails: [],
  projectiles: [],
});
const started = { type: 'matchStarted' } as ServerMessage;
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('attachPhoneView', () => {
  it('queues messages during load, keeps only the latest snapshot, then forwards live', async () => {
    const c = fakeClient();
    const v = fakeView();
    let resolve!: (v: PhoneViewLike) => void;
    const h = attachPhoneView(c.client, {} as HTMLElement, () => new Promise((r) => (resolve = r)));
    c.emit(started);
    c.emit(snap(1));
    c.emit(snap(2));
    h.setBatterySaver(true);
    resolve(v);
    await flush();
    expect(v.log).toEqual(['mount', 'saver:true', 'matchStarted', 'snapshot']);
    c.emit(snap(3));
    expect(v.log.at(-1)).toBe('snapshot');
    h.dispose();
    expect(c.subs()).toBe(0);
    expect(v.log.at(-1)).toBe('dispose');
  });

  it('disposes a view that finishes loading after dispose', async () => {
    const c = fakeClient();
    const v = fakeView();
    let resolve!: (v: PhoneViewLike) => void;
    const h = attachPhoneView(c.client, {} as HTMLElement, () => new Promise((r) => (resolve = r)));
    h.dispose();
    resolve(v);
    await flush();
    expect(v.log).toEqual(['dispose']);
  });
});
