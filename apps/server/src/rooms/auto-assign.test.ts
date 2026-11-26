import { describe, expect, it } from 'vitest';
import { NAME_MAX } from '@snails/protocol';
import { RoomManager } from './room-manager.js';

function setup() {
  const m = new RoomManager();
  const room = m.createRoom();
  const add = (name: string) => {
    const r = m.join(room.code, name, 'controller', () => {});
    if (!r.ok) throw new Error(r.code);
    return r.member;
  };
  return { m, room, add };
}

describe('automatic team assignment', () => {
  it('gives each phone the first free slot, an unused colour and default names', () => {
    const { room, add } = setup();
    const [a, b, c] = [add('a'), add('b'), add('c')];
    expect([a, b, c].map((x) => x.teamId)).toEqual(['A', 'B', 'C']);
    expect(new Set([a, b, c].map((x) => x.colour)).size).toBe(3);
    expect(new Set([a, b, c].map((x) => x.teamName)).size).toBe(3);
    expect(a.snailNames).toHaveLength(8);
    expect(new Set(a.snailNames).size).toBe(8);
    expect(room.lobbyState()).toMatchObject({ players: [{ teamName: a.teamName }, {}, {}] });
  });

  it('reuses the slot of a phone that left', () => {
    const { m, room, add } = setup();
    const a = add('a');
    add('b');
    m.leave(room.code, a.token);
    expect(add('c').teamId).toBe('A');
  });

  it('refuses a phone when every slot is taken', () => {
    const { m, room, add } = setup();
    const host = add('host');
    for (let i = 0; i < 7; i++)
      room.handleLobbyAction(host, {
        type: 'addCpu',
        difficulty: 'rookie',
        personality: 'cautious',
      });
    expect(m.join(room.code, 'late', 'controller', () => {})).toEqual({
      ok: false,
      code: 'teams_full',
    });
  });

  it('lets a player rename team and snails, with cleaning and fresh defaults for blanks', () => {
    const { room, add } = setup();
    const a = add('a');
    room.handleLobbyAction(a, { type: 'setTeamName', name: `  ${'x'.repeat(40)}  ` });
    expect(a.teamName).toBe('x'.repeat(NAME_MAX));
    room.handleLobbyAction(a, { type: 'setTeamName', name: '   ' });
    expect(a.teamName?.length).toBeGreaterThan(0);
    room.handleLobbyAction(a, { type: 'setSnailNames', names: ['Gary', '', '<i>Zed</i>'] });
    expect(a.snailNames?.slice(0, 3)).toEqual(['Gary', a.snailNames?.[1], '<i>Zed</i>']);
    expect(a.snailNames?.[1]).toBeTruthy();
    expect(a.snailNames).toHaveLength(8);
  });
});
