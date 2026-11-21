import { networkInterfaces } from 'node:os';

/** Returns the first non-internal IPv4 address, or 127.0.0.1 if none. */
export function findLanIPv4(): string {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return '127.0.0.1';
}

/** Builds the URL phones open to join a room. */
export function joinUrl(host: string, port: number, roomCode: string): string {
  return `http://${host}:${port}/?room=${roomCode}`;
}
