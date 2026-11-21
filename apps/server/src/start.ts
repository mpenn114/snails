import { buildServer } from './app.js';
import { RoomManager } from './rooms/room-manager.js';
import { findLanIPv4, joinUrl } from './net/lan.js';

/** Result of startServer. */
export interface RunningServer {
  roomCode: string;
  url: string;
  close(): Promise<void>;
}

/** Starts the server on all interfaces, creates a room and returns its join URL. */
export async function startServer(port: number, staticDir?: string): Promise<RunningServer> {
  const rooms = new RoomManager();
  const room = rooms.createRoom();
  const app = await buildServer({ rooms, ...(staticDir ? { staticDir } : {}) });
  await app.listen({ port, host: '0.0.0.0' });
  return {
    roomCode: room.code,
    url: joinUrl(findLanIPv4(), port, room.code),
    close: () => app.close(),
  };
}
