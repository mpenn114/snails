import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { PROTOCOL_VERSION, checkHello } from '@snails/protocol';
import type { ServerMessage } from '@snails/protocol';
import { RoomManager } from './rooms/room-manager.js';

/** Options for buildServer. */
export interface ServerOptions {
  /** Directory with the built controller; served at / if it exists. */
  staticDir?: string;
  rooms?: RoomManager;
}

const defaultStatic = fileURLToPath(new URL('../../controller/dist', import.meta.url));

/** Builds the Fastify app with /health, static controller and the /ws endpoint. */
export async function buildServer(opts: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify();
  const rooms = opts.rooms ?? new RoomManager();
  await app.register(websocket);

  app.get('/health', async () => ({ ok: true, protocolVersion: PROTOCOL_VERSION }));

  const dir = opts.staticDir ?? defaultStatic;
  if (existsSync(dir)) await app.register(fastifyStatic, { root: dir });

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
          return send({
            type: 'error',
            code: check.error,
            message: check.error === 'bad_message' ? 'Invalid message' : 'Protocol mismatch',
            ...(check.error === 'protocol_mismatch'
              ? { expected: check.expected, got: check.got }
              : {}),
          });
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
