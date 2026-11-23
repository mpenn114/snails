/** Navigator subset used for platform sniffing. */
export interface PlatformNavigator {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  /** Set by iOS Safari when launched from the home screen. */
  standalone?: boolean;
}

/** True on iPhone/iPad/iPod, including iPadOS 13+ which reports itself as a Mac. */
export function isIos(nav: PlatformNavigator): boolean {
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
}

/** True when running as an installed PWA (iOS `navigator.standalone` or the display-mode query). */
export function isStandalone(
  nav: PlatformNavigator,
  matchMedia?: (query: string) => { matches: boolean },
): boolean {
  if (nav.standalone === true) return true;
  try {
    return matchMedia?.('(display-mode: standalone)').matches ?? false;
  } catch {
    return false;
  }
}

/** iOS devices reach 3x; rendering at 3x is wasteful, so cap the ratio at 2 there. */
export function capPixelRatio(dpr: number, ios: boolean): number {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return ios ? Math.min(d, 2) : d;
}

/**
 * Returns Web Storage or undefined. Merely reading `window.localStorage` can throw (blocked
 * cookies, some private modes), as can a probe write (quota 0 in old private Safari).
 */
export function safeStorage(
  get: () => Storage | undefined = () => localStorage,
): Storage | undefined {
  try {
    const s = get();
    if (!s) return undefined;
    const probe = '__snails_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return undefined;
  }
}

/** Event target subset for the touch guards. */
export interface GuardTarget {
  addEventListener(type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
  removeEventListener(type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
}

/**
 * iOS ignores `user-scalable=no`: block pinch-zoom (`gesturestart`/`gesturechange`), and the
 * stray multi-touch page zoom by cancelling multi-finger `touchmove`s. Double-tap zoom is handled
 * by `touch-action` CSS (cancelling `touchend` would swallow rapid button taps). Listeners are
 * non-passive so `preventDefault` takes effect. Returns a disposer.
 */
export function installTouchGuards(target: GuardTarget): () => void {
  const cancel = (e: Event): void => e.preventDefault();
  const onTouchMove = (e: Event): void => {
    const touches = (e as Event & { touches?: ArrayLike<unknown> }).touches;
    if (touches && touches.length > 1) e.preventDefault();
  };
  const opts = { passive: false };
  target.addEventListener('gesturestart', cancel, opts);
  target.addEventListener('gesturechange', cancel, opts);
  target.addEventListener('touchmove', onTouchMove, opts);
  return () => {
    target.removeEventListener('gesturestart', cancel, opts);
    target.removeEventListener('gesturechange', cancel, opts);
    target.removeEventListener('touchmove', onTouchMove, opts);
  };
}
