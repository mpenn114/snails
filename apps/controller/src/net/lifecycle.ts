/** Event target subset (window or document). */
interface Listenable {
  addEventListener(type: string, fn: EventListener): void;
  removeEventListener(type: string, fn: EventListener): void;
}

/** What the lifecycle binding needs from the client. */
export interface ResumableClient {
  resume(): void;
  close(): void;
}

/**
 * Reconnects the client when the page returns from the background (`visibilitychange`) or the
 * bfcache (`pageshow` with `persisted`) or the network returns (`online`, which skips a long backoff wait), and closes the socket on a real unload (`pagehide` with
 * `persisted === false`). Returns a disposer.
 */
export function bindPageLifecycle(
  client: ResumableClient,
  win: Listenable,
  doc: Listenable & { hidden: boolean },
): () => void {
  const onShow = (e: Event): void => {
    if ((e as PageTransitionEvent).persisted) client.resume();
  };
  const onHide = (e: Event): void => {
    if ((e as PageTransitionEvent).persisted === false) client.close();
  };
  const onVisible = (): void => {
    if (!doc.hidden) client.resume();
  };
  const onOnline = (): void => client.resume();
  win.addEventListener('online', onOnline);
  win.addEventListener('pageshow', onShow);
  win.addEventListener('pagehide', onHide);
  doc.addEventListener('visibilitychange', onVisible);
  return () => {
    win.removeEventListener('online', onOnline);
    win.removeEventListener('pageshow', onShow);
    win.removeEventListener('pagehide', onHide);
    doc.removeEventListener('visibilitychange', onVisible);
  };
}
