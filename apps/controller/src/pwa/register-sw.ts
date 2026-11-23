/** Minimal service worker container surface used by {@link registerServiceWorker}. */
export interface ServiceWorkerContainerLike {
  /** Registers the worker script at `url` and resolves once registration is accepted. */
  register(url: string): Promise<unknown>;
}

/** Minimal navigator surface: only `serviceWorker` matters here. */
export interface NavigatorLike {
  /** Present only in browsers (and secure contexts) that support service workers. */
  serviceWorker?: ServiceWorkerContainerLike;
}

/**
 * Registers the controller service worker when the environment supports it.
 * Never throws: unsupported browsers and registration failures resolve to `false`.
 *
 * @param nav - The navigator to register on (pass `globalThis.navigator`); `undefined` is a no-op.
 * @param scriptUrl - Service worker script URL; defaults to `/sw.js` at the origin root.
 * @returns `true` when registration succeeded, `false` otherwise.
 */
export async function registerServiceWorker(
  nav: NavigatorLike | undefined,
  scriptUrl = '/sw.js',
): Promise<boolean> {
  const container = nav?.serviceWorker;
  if (!container || typeof container.register !== 'function') return false;
  try {
    await container.register(scriptUrl);
    return true;
  } catch {
    return false;
  }
}
