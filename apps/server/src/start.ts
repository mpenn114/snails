import { buildServer } from './app.js';
import { RoomManager } from './rooms/room-manager.js';
import { detectLanIPv4, displayUrl, joinUrl, primaryLanIp } from './net/lan.js';

/** Result of startServer. */
export interface RunningServer {
  roomCode: string;
  url: string;
  /** Where the host PC opens the TV view (display), already pointed at this room. */
  displayUrl: string;
  close(): Promise<void>;
}

/**
 * Starts the server on all interfaces, creates a room and returns its join URL.
 * @param port TCP port to listen on
 * @param staticDir optional controller bundle directory override
 * @returns the room code, join URL and a close function
 */
export async function startServer(port: number, staticDir?: string): Promise<RunningServer> {
  const rooms = new RoomManager();
  const room = rooms.createRoom();
  rooms.setDefaultRoom(room.code);
  const app = await buildServer({ rooms, port, ...(staticDir ? { staticDir } : {}) });
  await app.listen({ port, host: '0.0.0.0' });
  const host = primaryLanIp(detectLanIPv4(), process.env['SNAILS_PUBLIC_HOST']);
  return {
    roomCode: room.code,
    url: joinUrl(host, port, room.code),
    displayUrl: displayUrl(port, room.code),
    close: () => app.close(),
  };
}
