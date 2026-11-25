import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@snails/protocol';
import { RoomManager } from './room-manager.js';

function setup() {
  const m = new RoomManager();
  const room = m.createRoom();
  const inbox = new Map<string, ServerMessage[]>();
  const add = (name: string) => {
    const log: ServerMessage[] = [];
    const r = m.join(room.code, name, 'controller', (x) => log.push(x));
    if (!r.ok) throw new Error(r.code);
    inbox.set(name, log);
    return r.member;
  };
  return { room, add, inbox };
}

const addCpu = { type: 'addCpu', difficulty: 'rookie', personality: 'aggressive' } as const;

describe('CPU teams in the lobby', () => {
  it('lets only the host add and remove CPU teams, and lists them ready', () => {
    const { room, add, inbox } = setup();
    const host = add('Ann');
    const guest = add('Bob');
    room.handleLobbyAction(guest, addCpu);
    expect(inbox.get('Bob')?.some((m) => m.type === 'error' && m.code === 'not_host')).toBe(true);
    room.handleLobbyAction(host, addCpu);
    room.handleLobbyAction(host, addCpu);
    const lobby = room.lobbyState();
    const cpus = lobby.type === 'lobbyState' ? lobby.players.filter((p) => p.cpu) : [];
    expect(cpus.map((p) => p.name)).toEqual(['CPU Rookie', 'CPU Rookie 2']);
    expect(cpus.every((p) => p.ready && p.connected && p.teamId === p.id)).toBe(true);
    expect(new Set(cpus.map((p) => p.colour)).size).toBe(2);
    room.handleLobbyAction(guest, { type: 'removeCpu', teamId: 'cpu-1' });
    expect(room.cpuTeams).toHaveLength(2);
    room.handleLobbyAction(host, { type: 'removeCpu', teamId: 'cpu-1' });
    expect(room.cpuTeams.map((c) => c.id)).toEqual(['cpu-2']);
  });

  it('rejects a CPU when the room already has the maximum number of teams', () => {
    const { room, add, inbox } = setup();
    const host = add('Ann');
    for (let i = 0; i < 8; i++) room.handleLobbyAction(host, addCpu);
    expect(room.cpuTeams).toHaveLength(8);
    room.handleLobbyAction(host, addCpu);
    expect(room.cpuTeams).toHaveLength(8);
    expect(inbox.get('Ann')?.some((m) => m.type === 'error' && m.code === 'teams_full')).toBe(true);
  });

  it('starts with one phone and a CPU, and keeps the CPU colour exclusive', () => {
    const { room, add, inbox } = setup();
    const host = add('Ann');
    room.handleLobbyAction(host, { type: 'setTeam', teamId: 'red' });
    room.handleLobbyAction(host, { type: 'setReady', ready: true });
    room.handleLobbyAction(host, addCpu);
    room.handleLobbyAction(host, {
      type: 'setColour',
      colour: room.cpuTeams[0]?.colour ?? '',
    });
    expect(host.colour).toBeNull();
    expect(inbox.get('Ann')?.some((m) => m.type === 'error')).toBe(true);
    room.handleLobbyAction(host, { type: 'startMatch', settings: {} });
    expect(room.phase).toBe('playing');
    room.endMatch();
  });
});
