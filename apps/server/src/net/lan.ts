import { networkInterfaces } from 'node:os';

/** Minimal shape of one address entry from `os.networkInterfaces()`. */
export interface LanAddressInfo {
  /** Address string, e.g. `192.168.1.20`. */
  address: string;
  /** Address family; Node reports `'IPv4'` or `'IPv6'` (older Node uses numbers). */
  family: string | number;
  /** True for loopback addresses. */
  internal: boolean;
}

/** Shape of `os.networkInterfaces()`, injectable for tests. */
export type LanInterfaces = Record<string, readonly LanAddressInfo[] | undefined>;

/** Name fragments of virtual, container or VPN adapters that never host phones. */
const VIRTUAL_NAME = /docker|veth|^br-|vmnet|vboxnet|virbr|^utun|tailscale|^zt|vethernet|wsl/i;

/**
 * Returns a sort tier for an IPv4 address (lower is better), or `undefined`
 * when the address must not be offered to phones.
 * @param address dotted-quad IPv4 string
 */
function ipv4Tier(address: string): number | undefined {
  const parts = address.split('.').map(Number);
  const [a = -1, b = -1] = parts;
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return undefined;
  }
  if (a === 127 || a === 0) return undefined;
  if (a === 169 && b === 254) return undefined;
  if (a === 192 && b === 168) return 0;
  if (a === 10) return 1;
  if (a === 172 && b >= 16 && b <= 31) return 2;
  return 3;
}

/** True when a family value from Node denotes IPv4. */
function isIPv4(family: string | number): boolean {
  return family === 'IPv4' || family === 4;
}

/**
 * Ranks usable LAN IPv4 candidates from an `os.networkInterfaces()`-shaped map.
 * Skips internal, link-local and virtual adapters; prefers 192.168.x, then 10.x,
 * then 172.16-31.x, keeping interface order within a tier. Duplicates are removed.
 * @param ifaces interface map, normally `os.networkInterfaces()`
 * @returns ranked IPv4 addresses, best first (may be empty)
 */
export function rankLanIPv4(ifaces: LanInterfaces): string[] {
  const ranked: { address: string; tier: number; order: number }[] = [];
  let order = 0;
  for (const [name, addrs] of Object.entries(ifaces)) {
    const virtual = VIRTUAL_NAME.test(name);
    for (const a of addrs ?? []) {
      order += 1;
      if (virtual || a.internal || !isIPv4(a.family)) continue;
      const tier = ipv4Tier(a.address);
      if (tier !== undefined) ranked.push({ address: a.address, tier, order });
    }
  }
  ranked.sort((x, y) => x.tier - y.tier || x.order - y.order);
  return [...new Set(ranked.map((r) => r.address))];
}

/**
 * Detects LAN IPv4 candidates on this machine.
 * @param ifaces optional injected interface map; defaults to `os.networkInterfaces()`
 * @returns ranked candidates, best first
 */
export function detectLanIPv4(ifaces: LanInterfaces = networkInterfaces()): string[] {
  return rankLanIPv4(ifaces);
}

/**
 * Chooses the address phones should use. An override (e.g. `SNAILS_PUBLIC_HOST`)
 * wins; otherwise the best detected candidate, or `127.0.0.1` when none exists.
 * @param candidates ranked candidates from {@link rankLanIPv4}
 * @param override optional explicit host to use instead
 * @returns the host string to advertise
 */
export function primaryLanIp(candidates: readonly string[], override?: string): string {
  const forced = override?.trim();
  if (forced) return forced;
  return candidates[0] ?? '127.0.0.1';
}

/**
 * Returns the best LAN IPv4 address, or 127.0.0.1 if none.
 * @returns the advertised IPv4 address
 */
export function findLanIPv4(): string {
  return primaryLanIp(detectLanIPv4());
}

/**
 * Builds the URL phones open to join a room.
 * @param host host or IP phones use
 * @param port server port
 * @param roomCode room code to pre-fill
 * @returns the join URL
 */
export function joinUrl(host: string, port: number, roomCode: string): string {
  return `http://${host}:${port}/?room=${roomCode}`;
}
