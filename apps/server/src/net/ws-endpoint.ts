import type { FastifyInstance } from 'fastify';
import type { HeartbeatOptions } from './heartbeat.js';
import { Connection } from './connection.js';
import type { ClientContext, ConnectionHandler, IntentMessage } from './connection.js';
import type { LatencyRegistry } from '../metrics/latency-registry.js';
import type { RoomManager, LobbyAction } from '../rooms/room-manager.js';

/** Receives controller intents for a room; plugged in by the game session layer. */
export type IntentSink = (roomCode: string, ctx: ClientContext, intent: IntentMessage) => void;

/**
 * Default handler: lobby actions go to the room, intents to an optional sink (no-op until
 * the game session is wired in), pings need no extra handling.
 * @param rooms the room registry
 * @param onIntent optional intent sink
 * @param latency optional latency registry; intents carrying `seq` are answered with `ack`
 * @returns a connection handler
 */
export function createRoomHandler(
  rooms: RoomManager,
  onIntent?: IntentSink,
  latency?: LatencyRegistry,
): ConnectionHandler {
  return {
    onLobbyAction(ctx, action: LobbyAction) {
      const room = rooms.getRoom(ctx.roomCode);
      const member = room?.members.get(ctx.sessionToken);
      if (room && member) room.handleLobbyAction(member, action);
    },
    onIntent(ctx, intent) {
      const room = rooms.getRoom(ctx.roomCode);
      const member = room?.members.get(ctx.sessionToken);
      const receivedAt = latency?.time() ?? 0;
      if (room && member) {
        if (latency) room.onMatchEnd ??= () => latency.matchEnded(room.code);
        room.handleIntent(member, intent);
        const tick = room.match?.currentTick?.();
        if (tick !== undefined) {
          latency?.intentApplied(room.code, receivedAt, tick);
          if (intent.seq !== undefined)
            member.send({ type: 'ack', seq: intent.seq, serverTick: tick });
        }
      }
      onIntent?.(ctx.roomCode, ctx, intent);
    },
    onPing() {},
  };
}

/**
 * Registers the `/ws` websocket route.
 * @param app Fastify instance with @fastify/websocket registered
 * @param rooms the room registry
 * @param handler optional handler override (defaults to {@link createRoomHandler})
 * @param heartbeat heartbeat overrides (defaults: ping 5 s, timeout 15 s)
 * @param latency optional latency registry (acks, histograms, `onSend` snapshot tracking)
 */
export function registerWsEndpoint(
  app: FastifyInstance,
  rooms: RoomManager,
  handler?: ConnectionHandler,
  heartbeat: HeartbeatOptions = {},
  latency?: LatencyRegistry,
): void {
  const h = handler ?? createRoomHandler(rooms, undefined, latency);
  app.get('/ws', { websocket: true }, (socket) => {
    new Connection(socket, {
      rooms,
      handler: h,
      heartbeat,
      ...(latency
        ? {
            onSend: (ctx, m) => {
              if (m.type === 'snapshot') latency.snapshotSent(ctx.roomCode, m.tick);
            },
          }
        : {}),
    });
  });
}
