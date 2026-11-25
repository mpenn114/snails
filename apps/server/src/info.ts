import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { PROTOCOL_VERSION } from '@snails/protocol';
import { detectLanIPv4, primaryLanIp, type LanInterfaces } from './net/lan.js';

/** JSON body returned by `GET /api/info`. */
export interface ServerInfo {
  /** Human-readable server name. */
  name: string;
  /** Server package version. */
  version: string;
  /** Wire protocol version the server speaks. */
  protocolVersion: number;
  /** All usable LAN IPv4 candidates, best first. */
  lanIps: string[];
  /** Address phones should use (override or best candidate). */
  primaryIp: string;
  /** True when a real LAN address was found or explicitly configured (not the loopback fallback). */
  lanFound: boolean;
  /** Host OS as reported by `process.platform` (e.g. `win32`, `darwin`, `linux`). */
  platform: string;
  /** Port the server listens on. */
  port: number;
  /** Base URL phones open to reach the controller. */
  joinUrl: string;
}

/** Inputs for {@link buildServerInfo}. */
export interface ServerInfoOptions {
  /** Port the server listens on. */
  port: number;
  /** Explicit public host; overrides detection (e.g. `SNAILS_PUBLIC_HOST`). */
  publicHost?: string;
  /** Injectable interface source; defaults to `os.networkInterfaces()`. */
  networkInterfaces?: () => LanInterfaces;
}

/**
 * Reads the server package version from `apps/server/package.json`.
 * @returns the version string, or `'unknown'` when unreadable
 */
function readServerVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
      const v = (parsed as { version: unknown }).version;
      if (typeof v === 'string') return v;
    }
  } catch {
    // fall through to the default below
  }
  return 'unknown';
}

const SERVER_VERSION = readServerVersion();

/**
 * Builds the `/api/info` payload: LAN candidates, the primary address and the join URL.
 * @param opts port, optional public host override and injectable interfaces
 * @returns the info object
 */
export function buildServerInfo(opts: ServerInfoOptions): ServerInfo {
  const read = opts.networkInterfaces ?? (() => networkInterfaces());
  const detected = detectLanIPv4(read());
  const primaryIp = primaryLanIp(detected, opts.publicHost);
  const lanIps = [...new Set([primaryIp, ...detected])];
  return {
    name: 'Snails',
    version: SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    lanIps,
    primaryIp,
    lanFound: detected.length > 0 || Boolean(opts.publicHost?.trim()),
    platform: process.platform,
    port: opts.port,
    joinUrl: `http://${primaryIp}:${opts.port}/`,
  };
}
