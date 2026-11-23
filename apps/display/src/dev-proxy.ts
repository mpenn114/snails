/** Default game server origin used by the Vite dev proxy (matches `apps/server` PORT default). */
export const DEFAULT_SERVER_URL = 'http://localhost:3000';

/** Minimal shape of a Vite proxy entry, kept local so this module has no runtime Vite import. */
export interface DevProxyEntry {
  /** Target origin the request is forwarded to. */
  target: string;
  /** Whether the proxy also forwards WebSocket upgrades. */
  ws?: boolean;
  /** Rewrites the Host header to the target when true. */
  changeOrigin?: boolean;
}

/**
 * Maps an http(s) server origin to its WebSocket equivalent.
 *
 * @param serverUrl - Origin such as `http://192.168.1.10:3000`.
 * @returns The origin with `ws:` or `wss:` as protocol.
 * @throws {Error} When the URL is invalid or uses an unsupported protocol.
 */
export function toWsOrigin(serverUrl: string): string {
  const url = new URL(serverUrl);
  if (url.protocol === 'http:') url.protocol = 'ws:';
  else if (url.protocol === 'https:') url.protocol = 'wss:';
  else if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error(`SNAILS_SERVER must be an http(s) or ws(s) URL, got "${serverUrl}"`);
  }
  return url.origin;
}

/**
 * Builds the Vite `server.proxy` table that forwards `/api` (HTTP) and `/ws` (WebSocket) to the
 * game server, so phones and TVs on the LAN only talk to the Vite dev origin.
 *
 * @param serverUrl - Game server origin; defaults to {@link DEFAULT_SERVER_URL}.
 * @returns Proxy entries keyed by path prefix.
 * @throws {Error} When `serverUrl` is not a valid http(s)/ws(s) URL.
 */
export function buildDevProxy(
  serverUrl: string = DEFAULT_SERVER_URL,
): Record<string, DevProxyEntry> {
  return {
    '/api': { target: new URL(serverUrl).origin, changeOrigin: true },
    '/ws': { target: toWsOrigin(serverUrl), ws: true, changeOrigin: true },
  };
}

/**
 * Resolves the game server origin from the `SNAILS_SERVER` environment variable.
 *
 * @param env - Environment record, normally `process.env` from the Vite config.
 * @returns The trimmed configured origin, or {@link DEFAULT_SERVER_URL} when unset or blank.
 */
export function serverUrlFromEnv(env: Record<string, string | undefined>): string {
  const value = env['SNAILS_SERVER']?.trim();
  return value ? value : DEFAULT_SERVER_URL;
}
