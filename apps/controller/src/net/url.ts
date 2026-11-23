/** Minimal location shape needed to build the WebSocket URL. */
export interface LocationLike {
  readonly protocol: string;
  readonly host: string;
}

/** Builds `ws(s)://<host>/ws` from the page location (wss on https). */
export function buildWsUrl(loc: LocationLike): string {
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${loc.host}/ws`;
}

/** Reconnect delay in ms: exponential from 250 ms, capped at 5 s, with up to 50% jitter. */
export function backoffDelay(attempt: number, random: number): number {
  const base = Math.min(5000, 250 * 2 ** Math.max(0, attempt));
  return Math.min(5000, Math.round(base * (0.5 + 0.5 * random)));
}
