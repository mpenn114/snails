import type { FastifyInstance } from 'fastify';
import { Connection } from './connection.js';
import type { ClientContext, ConnectionHandler, IntentMessage } from './connection.js';
import type { RoomManager, LobbyAction } from '../rooms/room-manager.js';

/** Receives controller intents for a room; plugged in by the game session layer. */
export type IntentSink = (roomCode: string, ctx: ClientContext, intent: IntentMessage) => void;

/**
 * Default handler: lobby actions go to the room, intents to an optional sink (no-op until
 * the game session is wired in), pings need no extra handling.
 * @param rooms the room registry
 * @param onIntent optional intent sink
 * @returns a connection handler
 */
export function createRoomHandler(rooms: RoomManager, onIntent?: IntentSink): ConnectionHandler {
  return {
    onLobbyAction(ctx, action: LobbyAction) {
      const room = rooms.getRoom(ctx.roomCode);
      const member = room?.members.get(ctx.sessionToken);
      if (room && member) room.handleLobbyAction(member, action);
    },
    onIntent(ctx, intent) {
      const room = rooms.getRoom(ctx.roomCode);
      const member = room?.members.get(ctx.sessionToken);
      if (room && member) room.handleIntent(member, intent);
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
 */
export function registerWsEndpoint(
  app: FastifyInstance,
  rooms: RoomManager,
  handler: ConnectionHandler = createRoomHandler(rooms),
): void {
  app.get('/ws', { websocket: true }, (socket) => {
    new Connection(socket, { rooms, handler });
  });
}
