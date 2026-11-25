import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MatchSettings } from '@snails/protocol';
import {
  SETTINGS_FILE,
  defaultDataDir,
  loadLobbySettings,
  saveLobbySettings,
} from './settings-store.js';
import { RoomManager } from './rooms/room-manager.js';

describe('settings-store', () => {
  it('round-trips and tolerates missing or corrupt files', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'snails-')), 'nested');
    expect(loadLobbySettings(dir)).toBeUndefined();
    const s = MatchSettings.parse({ turnTimeSeconds: 45 });
    saveLobbySettings(dir, s);
    expect(loadLobbySettings(dir)).toEqual(s);
    writeFileSync(join(dir, SETTINGS_FILE), '{bad');
    expect(loadLobbySettings(dir)).toBeUndefined();
    writeFileSync(join(dir, SETTINGS_FILE), '{"turnTimeSeconds":-5}');
    expect(loadLobbySettings(dir)).toBeUndefined();
  });

  it('picks OS data dirs and honours SNAILS_DATA_DIR', () => {
    expect(defaultDataDir({ SNAILS_DATA_DIR: '/x' }, 'linux', '/h')).toBe('/x');
    expect(defaultDataDir({}, 'linux', '/h')).toBe(join('/h', '.config', 'snails'));
    expect(defaultDataDir({}, 'darwin', '/h')).toBe(
      join('/h', 'Library', 'Application Support', 'Snails'),
    );
    expect(defaultDataDir({ APPDATA: '/a' }, 'win32', '/h')).toBe(join('/a', 'Snails'));
  });

  it('new rooms start from remembered settings and report changes', () => {
    const seen: MatchSettings[] = [];
    const initial = MatchSettings.parse({ turnTimeSeconds: 50 });
    const rooms = new RoomManager({
      initialSettings: initial,
      onSettingsChange: (s) => seen.push(s),
    });
    const room = rooms.createRoom();
    expect(room.settings.turnTimeSeconds).toBe(50);
    room.onSettingsChange(MatchSettings.parse({ turnTimeSeconds: 60 }));
    expect(seen[0]?.turnTimeSeconds).toBe(60);
  });
});
