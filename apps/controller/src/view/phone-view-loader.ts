import type { ServerMessage } from '@snails/protocol';
import type { ControllerClient } from '../net/client';

/** What the loader needs from the lazily loaded phone view. */
export interface PhoneViewLike {
  mount(container: HTMLElement): void;
  onMessage(msg: ServerMessage): void;
  dispose(): void;
  setBatterySaver?(on: boolean): void;
}

/** Loads the view module; the default is a dynamic import so three.js stays out of the entry chunk. */
export type PhoneViewFactory = () => Promise<PhoneViewLike>;

/** Handle returned by {@link attachPhoneView}. */
export interface PhoneViewHandle {
  /** Toggles the battery saver once the view has loaded (remembered until then). */
  setBatterySaver(on: boolean): void;
  /** Unsubscribes and disposes the view (also if it is still loading). */
  dispose(): void;
}

const VIEW_TYPES = ['matchStarted', 'snapshot', 'eventBatch'] as const;

const loadPhoneView: PhoneViewFactory = async () => {
  const mod = await import('./phone-view');
  return new mod.PhoneView();
};

/**
 * Wires a ControllerClient to a lazily loaded PhoneView. Messages that arrive while the chunk is
 * still loading are queued (only the latest snapshot is kept) and replayed in order.
 */
export function attachPhoneView(
  client: ControllerClient,
  container: HTMLElement,
  factory: PhoneViewFactory = loadPhoneView,
): PhoneViewHandle {
  let view: PhoneViewLike | null = null;
  let disposed = false;
  let saver: boolean | null = null;
  let queue: ServerMessage[] = [];
  const deliver = (m: ServerMessage): void => {
    if (view) view.onMessage(m);
    else if (m.type === 'snapshot') {
      queue = queue.filter((q) => q.type !== 'snapshot');
      queue.push(m);
    } else queue.push(m);
  };
  const offs = VIEW_TYPES.map((t) => client.on(t, deliver));
  void factory().then((v) => {
    if (disposed) {
      v.dispose();
      return;
    }
    v.mount(container);
    if (saver !== null) v.setBatterySaver?.(saver);
    view = v;
    for (const m of queue) v.onMessage(m);
    queue = [];
  });
  return {
    setBatterySaver(on) {
      saver = on;
      view?.setBatterySaver?.(on);
    },
    dispose() {
      disposed = true;
      for (const off of offs) off();
      view?.dispose();
      view = null;
    },
  };
}
