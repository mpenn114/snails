import { describe, expect, it } from 'vitest';
import { RoomManager } from './room-manager.js';

describe('RoomManager', () => {
  it('creates rooms, joins and cleans up', () => {
    const m = new RoomManager();
    const room = m.createRoom();
    expect(room.code).toMatch(/^[A-Z]{4}$/);
    const p = m.join(room.code.toLowerCase(), 'Ann', 'controller');
    expect(p?.name).toBe('Ann');
    expect(m.join('ZZZZ', 'x', 'display')).toBeUndefined();
    m.leave(room.code, p!.id);
    expect(m.getRoom(room.code)).toBeUndefined();
  });
});
