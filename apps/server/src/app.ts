import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { PROTOCOL_VERSION, parseClientMessage } from '@snails/protocol';
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
        const msg = parseClientMessage(JSON.parse(String(data)));
        if (msg.type !== 'hello') return;
        const player = rooms.join(msg.roomCode, msg.name, msg.role);
        if (!player) return send({ type: 'error', code: 'no-room', message: 'Unknown room' });
        joined = { code: msg.roomCode, id: player.id };
        send({
          type: 'welcome',
          playerId: player.id,
          roomCode: msg.roomCode.toUpperCase(),
          protocolVersion: PROTOCOL_VERSION,
        });
      } catch {
        send({ type: 'error', code: 'bad-message', message: 'Invalid message' });
      }
    });
    socket.on('close', () => joined && rooms.leave(joined.code, joined.id));
  });
  return app;
}
