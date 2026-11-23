import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { PROTOCOL_VERSION, checkHello } from '@snails/protocol';
import type { ServerMessage } from '@snails/protocol';
import { RoomManager } from './rooms/room-manager.js';
import { buildServerInfo, type ServerInfo } from './info.js';
import { installSpaFallback, registerStaticRoots } from './static.js';
import type { LanInterfaces } from './net/lan.js';

/** Options for buildServer. */
export interface ServerOptions {
  /** Directory with the built controller; served at `/` if it exists. */
  staticDir?: string;
  /** Directory with the built display; served at `/display/` if it exists. */
  displayDir?: string;
  /** Port reported by `/api/info`. Defaults to 3000. */
  port?: number;
  /** Explicit public host for join URLs. Defaults to `SNAILS_PUBLIC_HOST`. */
  publicHost?: string;
  /** Injectable interface source for LAN detection. */
  networkInterfaces?: () => LanInterfaces;
  rooms?: RoomManager;
}

const defaultStatic = fileURLToPath(new URL('../../controller/dist', import.meta.url));
const defaultDisplay = fileURLToPath(new URL('../../display/dist', import.meta.url));

/**
 * Builds the Fastify app with /health, /api/info, the static controller and display
 * bundles, an SPA fallback and the /ws endpoint.
 * @param opts optional overrides for static roots, port, LAN detection and rooms
 * @returns the configured, not-yet-listening Fastify instance
 */
export async function buildServer(opts: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify();
  const rooms = opts.rooms ?? new RoomManager();
  const port = opts.port ?? 3000;
  const publicHost = opts.publicHost ?? process.env['SNAILS_PUBLIC_HOST'];
  await app.register(websocket);

  app.get('/health', async () => ({ ok: true, protocolVersion: PROTOCOL_VERSION }));
  app.get('/api/info', async (): Promise<ServerInfo> =>
    buildServerInfo({
      port,
      ...(publicHost ? { publicHost } : {}),
      ...(opts.networkInterfaces ? { networkInterfaces: opts.networkInterfaces } : {}),
    }),
  );

  const roots = {
    controllerDir: opts.staticDir ?? defaultStatic,
    displayDir: opts.displayDir ?? defaultDisplay,
  };
  await registerStaticRoots(app, roots);
  installSpaFallback(app, roots);

  app.get('/ws', { websocket: true }, (socket) => {
    const send = (m: ServerMessage): void => socket.send(JSON.stringify(m));
    let joined: { code: string; id: string } | undefined;
    socket.on('message', (data) => {
      try {
        const raw: unknown = JSON.parse(String(data));
        if (typeof raw === 'object' && raw !== null && (raw as { type?: unknown }).type !== 'hello')
          return;
        const check = checkHello(raw);
        if (!check.ok) {
          return send(helloError(check));
        }
        const msg = check.hello;
        const code = msg.roomCode ?? (msg.role === 'display' ? rooms.createRoom().code : undefined);
        const player = code ? rooms.join(code, msg.name, msg.role) : undefined;
        if (!code || !player)
          return send({ type: 'error', code: 'no_room', message: 'Unknown room' });
        joined = { code, id: player.id };
        send({
          type: 'welcome',
          playerId: player.id,
          roomCode: code.toUpperCase(),
          sessionToken: player.id,
          role: msg.role,
          protocolVersion: PROTOCOL_VERSION,
        });
      } catch {
        send({ type: 'error', code: 'bad_message', message: 'Invalid message' });
      }
    });
    socket.on('close', () => joined && rooms.leave(joined.code, joined.id));
  });
  return app;
}

/** Builds the error reply for a rejected hello. */
function helloError(check: Exclude<ReturnType<typeof checkHello>, { ok: true }>): ServerMessage {
  return {
    type: 'error',
    code: check.error,
    message: check.error === 'bad_message' ? 'Invalid message' : 'Protocol mismatch',
    ...(check.error === 'protocol_mismatch' ? { expected: check.expected, got: check.got } : {}),
  };
}
