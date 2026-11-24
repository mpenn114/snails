import type { ServerMessage } from '@snails/protocol';
import type { AimStore } from '../controls/aim-store';
import type { ControllerClient } from '../net/client';

/** What the loader needs from the lazily loaded phone view. */
export interface PhoneViewLike {
  mount(container: HTMLElement): void;
  onMessage(msg: ServerMessage): void;
  dispose(): void;
  setBatterySaver?(on: boolean): void;
  setAiming?(aiming: boolean): void;
  /** Current camera yaw of the render rig (radians), if a rig exists. */
  cameraYaw?(): number | null;
  /** Shared aim state driving the aim camera and the 3D aim view (set before `mount`). */
  setAimStore?(store: AimStore): void;
}

/** Loads the view module; the default is a dynamic import so three.js stays out of the entry chunk. */
export type PhoneViewFactory = () => Promise<PhoneViewLike>;

/** Handle returned by {@link attachPhoneView}. */
export interface PhoneViewHandle {
  /** Toggles the battery saver once the view has loaded (remembered until then). */
  setBatterySaver(on: boolean): void;
  /** Tells the camera the local player is (not) aiming: aim mode while true (remembered until loaded). */
  setAiming(aiming: boolean): void;
  /**
   * Camera yaw of the render rig in radians (offset `(cos yaw, sin yaw)` from the target), or
   * PI/2 (side-on view) until the view and rig exist. Feed to `cameraRightYaw` in aim-mapping.
   */
  cameraYaw(): number;
  /** Unsubscribes and disposes the view (also if it is still loading). */
  dispose(): void;
}

const VIEW_TYPES = ['matchStarted', 'snapshot', 'eventBatch', 'turnStart', 'aimPreview'] as const;

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
  aimStore?: AimStore,
): PhoneViewHandle {
  let view: PhoneViewLike | null = null;
  let disposed = false;
  let saver: boolean | null = null;
  let aiming = false;
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
    if (aimStore) v.setAimStore?.(aimStore);
    v.mount(container);
    if (saver !== null) v.setBatterySaver?.(saver);
    view = v;
    if (aiming) v.setAiming?.(true);
    for (const m of queue) v.onMessage(m);
    queue = [];
  });
  return {
    setBatterySaver(on) {
      saver = on;
      view?.setBatterySaver?.(on);
    },
    setAiming(a) {
      aiming = a;
      view?.setAiming?.(a);
    },
    cameraYaw: () => view?.cameraYaw?.() ?? Math.PI / 2,
    dispose() {
      disposed = true;
      for (const off of offs) off();
      view?.dispose();
      view = null;
    },
  };
}
