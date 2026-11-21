/** A connected participant. */
export interface Player {
  id: string;
  name: string;
  role: 'controller' | 'display';
}

/** A lobby room. */
export interface Room {
  code: string;
  players: Map<string, Player>;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Tracks rooms and their players. */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private nextId = 1;

  /** Creates a room with a random 4-letter code. */
  createRoom(random: () => number = Math.random): Room {
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room: Room = { code, players: new Map() };
    this.rooms.set(code, room);
    return room;
  }

  /** Returns a room by code (case-insensitive). */
  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Adds a player to a room; returns undefined if the room does not exist. */
  join(code: string, name: string, role: Player['role']): Player | undefined {
    const room = this.getRoom(code);
    if (!room) return undefined;
    const player: Player = { id: `p${this.nextId++}`, name, role };
    room.players.set(player.id, player);
    return player;
  }

  /** Removes a player; deletes the room when empty. */
  leave(code: string, playerId: string): void {
    const room = this.getRoom(code);
    if (!room) return;
    room.players.delete(playerId);
    if (room.players.size === 0) this.rooms.delete(room.code);
  }
}
