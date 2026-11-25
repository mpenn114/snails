import { createServer } from 'node:net';

/** Tries to bind `port` on all interfaces; resolves the bound port or null on failure. */
function tryBind(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(null));
    srv.listen({ port, host: '0.0.0.0' }, () => {
      const addr = srv.address();
      const bound = typeof addr === 'object' && addr ? addr.port : null;
      srv.close(() => resolve(bound));
    });
  });
}

/**
 * Picks a free TCP port: the preferred one if available, otherwise an OS-assigned one.
 * @param preferred port to try first
 * @returns a port that was free a moment ago
 */
export async function pickFreePort(preferred: number): Promise<number> {
  const first = await tryBind(preferred);
  if (first !== null) return first;
  const fallback = await tryBind(0);
  if (fallback === null) throw new Error('No free TCP port available');
  return fallback;
}
